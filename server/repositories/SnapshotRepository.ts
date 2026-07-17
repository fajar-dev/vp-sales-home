import { RowDataPacket } from "mysql2";
import { DatabaseConnection } from "../db/DatabaseConnection";
import { DatabaseConfig } from "../config/DatabaseConfig";
import { billingPeriodToIso } from "@/domain/calculators/time-bucket.calculator";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import { UNMAPPED_LABEL } from "@/domain/constants";
import { RedisManager } from "../cache/RedisManager";
import { ISnapshotRepository, SnapshotsPayload } from "./ISnapshotRepository";
import {
  ACTIVATION_SUBQUERY,
  buildTenureClause,
  sanitizeYears,
  serviceHasInvoiceExists,
  serviceHasPaidInvoiceExists,
  tenureIncludesNew,
  yearBillingList,
} from "./sql-helpers";

interface CountRow extends RowDataPacket {
  period: string; // MMYY
  branch_id: string | null;
  branch_city: string | null;
  service_group: string | null;
  service_id: string | null;
  service_type: string | null;
  manager_sales_id: string | null;
  manager_sales_name: string | null;
  sales_id: string | null;
  sales_name: string | null;
  active_count: string | number;
  churn_count: string | number;
  block_count: string | number;
}

interface NewRow extends RowDataPacket {
  iso_period: string; // YYYY-MM
  branch_id: string | null;
  branch_city: string | null;
  service_group: string | null;
  service_id: string | null;
  service_type: string | null;
  manager_sales_id: string | null;
  manager_sales_name: string | null;
  sales_id: string | null;
  sales_name: string | null;
  new_count: string | number;
  new_connected_count: string | number;
  new_paid_count: string | number;
  new_blocked_count: string | number;
}

/** One aggregated dashboard row being assembled (counts ∪ new-services). */
interface MergedRow {
  isoPeriod: string;
  branchId: string | null;
  branchCity: string | null;
  serviceGroup: string | null;
  serviceId: string | null;
  serviceType: string | null;
  leadId: string | null;
  leadName: string | null;
  amId: string | null;
  amName: string | null;
  activeCount: number;
  churnCount: number;
  blockCount: number;
  newCount: number;
  newConnectedCount: number;
  newPaidCount: number;
  newBlockedCount: number;
}

export class SnapshotRepository implements ISnapshotRepository {
  private toId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  /**
   * Monthly status counts, aggregated in SQL. Grain:
   * period × display-branch × service group × service plan × lead × AM.
   */
  private buildCountsSql(year: number, tenure: string | null, params: Record<string, unknown>): string {
    const needsActivation = Boolean(tenure && tenure !== "all");
    const tenureClause = buildTenureClause(tenure, "act.activated_at", "cse.Period", params);

    return /* sql */ `
      SELECT
        cse.Period                                     AS period,
        IFNULL(cust.DisplayBranchId, cust.BranchId)    AS branch_id,
        nb.BranchCity                                  AS branch_city,
        sg.Description                                 AS service_group,
        cse.ServiceId                                  AS service_id,
        s.ServiceType                                  AS service_type,
        cs.ManagerSalesId                              AS manager_sales_id,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
        cs.SalesId                                     AS sales_id,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
        SUM(cse.CustStatus IN ('AC', 'FR'))            AS active_count,
        SUM(cse.CustStatus = 'NA')                     AS churn_count,
        SUM(cse.CustStatus = 'BL')                     AS block_count
      FROM CustomerServiceExcerpt cse
      JOIN CustomerServices cs ON cs.CustServId = cse.CustServId
      JOIN Customer cust       ON cust.CustId = cse.CustId
      JOIN Services s          ON s.ServiceId = cse.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN NusaBranch nb   ON nb.BranchId = IFNULL(cust.DisplayBranchId, cust.BranchId)
      LEFT JOIN Employee mgr    ON mgr.EmpId = cs.ManagerSalesId
      LEFT JOIN Employee sls    ON sls.EmpId = cs.SalesId
      ${needsActivation ? `LEFT JOIN (${ACTIVATION_SUBQUERY}) act ON act.cust_serv_id = cse.CustServId` : ""}
      WHERE cse.Period IN (${yearBillingList(year)})
        AND cust.BranchId = :branchId
        AND s.ServiceCategory = :serviceCategory
        ${tenureClause}
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    `;
  }

  /**
   * New services per activation month (query.md #5 shape) with real
   * billing/payment funnel flags: invoiced (homeconnect) & paid (homepaid).
   */
  private buildNewServicesSql(): string {
    return /* sql */ `
      SELECT
        DATE_FORMAT(act.activated_at, '%Y-%m')         AS iso_period,
        IFNULL(cust.DisplayBranchId, cust.BranchId)    AS branch_id,
        nb.BranchCity                                  AS branch_city,
        sg.Description                                 AS service_group,
        cs.ServiceId                                   AS service_id,
        s.ServiceType                                  AS service_type,
        cs.ManagerSalesId                              AS manager_sales_id,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
        cs.SalesId                                     AS sales_id,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
        COUNT(DISTINCT cs.CustServId)                  AS new_count,
        SUM(${serviceHasInvoiceExists("cs.CustServId")})     AS new_connected_count,
        SUM(${serviceHasPaidInvoiceExists("cs.CustServId")}) AS new_paid_count,
        SUM(cs.CustStatus = 'BL')                      AS new_blocked_count
      FROM CustomerServices cs
      JOIN Customer cust ON cust.CustId = cs.CustId AND cust.BranchId = :branchId
      JOIN Services s    ON s.ServiceId = cs.ServiceId AND s.ServiceCategory = :serviceCategory
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN NusaBranch nb   ON nb.BranchId = IFNULL(cust.DisplayBranchId, cust.BranchId)
      LEFT JOIN Employee mgr    ON mgr.EmpId = cs.ManagerSalesId
      LEFT JOIN Employee sls    ON sls.EmpId = cs.SalesId
      JOIN (${ACTIVATION_SUBQUERY}) act ON act.cust_serv_id = cs.CustServId
      WHERE act.activated_at >= :rangeStart
        AND act.activated_at < :rangeEnd
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    `;
  }

  private mergeKey(row: {
    isoPeriod: string;
    branchId: string | null;
    serviceGroup: string | null;
    serviceId: string | null;
    leadId: string | null;
    amId: string | null;
  }): string {
    return [
      row.isoPeriod,
      row.branchId ?? "",
      row.serviceGroup ?? "",
      row.serviceId ?? "",
      row.leadId ?? "",
      row.amId ?? "",
    ].join("|");
  }

  private async fetchYear(year: number, tenure: string | null): Promise<MergedRow[]> {
    const baseParams = {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
    };

    const countsParams: Record<string, unknown> = { ...baseParams };
    const countsSql = this.buildCountsSql(year, tenure, countsParams);

    const newParams: Record<string, unknown> = {
      ...baseParams,
      rangeStart: `${year}-01-01`,
      rangeEnd: `${year + 1}-01-01`,
    };

    const [countRows, newRows] = await Promise.all([
      DatabaseConnection.query<CountRow>(countsSql, countsParams),
      tenureIncludesNew(tenure)
        ? DatabaseConnection.query<NewRow>(this.buildNewServicesSql(), newParams)
        : Promise.resolve([] as NewRow[]),
    ]);

    const merged = new Map<string, MergedRow>();

    for (const r of countRows) {
      const row: MergedRow = {
        isoPeriod: billingPeriodToIso(r.period),
        branchId: this.toId(r.branch_id),
        branchCity: r.branch_city,
        serviceGroup: r.service_group,
        serviceId: this.toId(r.service_id),
        serviceType: r.service_type,
        leadId: this.toId(r.manager_sales_id),
        leadName: r.manager_sales_name,
        amId: this.toId(r.sales_id),
        amName: r.sales_name,
        activeCount: Number(r.active_count) || 0,
        churnCount: Number(r.churn_count) || 0,
        blockCount: Number(r.block_count) || 0,
        newCount: 0,
        newConnectedCount: 0,
        newPaidCount: 0,
        newBlockedCount: 0,
      };
      merged.set(this.mergeKey(row), row);
    }

    for (const r of newRows) {
      const partial = {
        isoPeriod: r.iso_period,
        branchId: this.toId(r.branch_id),
        serviceGroup: r.service_group,
        serviceId: this.toId(r.service_id),
        leadId: this.toId(r.manager_sales_id),
        amId: this.toId(r.sales_id),
      };
      const key = this.mergeKey(partial);
      const existing = merged.get(key);
      if (existing) {
        existing.newCount += Number(r.new_count) || 0;
        existing.newConnectedCount += Number(r.new_connected_count) || 0;
        existing.newPaidCount += Number(r.new_paid_count) || 0;
        existing.newBlockedCount += Number(r.new_blocked_count) || 0;
      } else {
        merged.set(key, {
          ...partial,
          branchCity: r.branch_city,
          serviceType: r.service_type,
          leadName: r.manager_sales_name,
          amName: r.sales_name,
          activeCount: 0,
          churnCount: 0,
          blockCount: 0,
          newCount: Number(r.new_count) || 0,
          newConnectedCount: Number(r.new_connected_count) || 0,
          newPaidCount: Number(r.new_paid_count) || 0,
          newBlockedCount: Number(r.new_blocked_count) || 0,
        });
      }
    }

    return Array.from(merged.values());
  }

  private mapRowToSnapshot(row: MergedRow, idx: number, generatedAt: string): ServiceMonthlySnapshot {
    return {
      snapshotId: `${row.isoPeriod}-${idx}`,
      period: row.isoPeriod,
      serviceId: `${row.isoPeriod}-grp-${idx}`,
      productServiceId: row.serviceId ?? "unknown-product",
      serviceType: row.serviceType?.trim() || row.serviceId || UNMAPPED_LABEL,
      custId: "",
      branchId: row.branchId ?? "unmapped-branch",
      leadId: row.leadId,
      amId: row.amId,
      serviceGroup: row.serviceGroup?.trim() || UNMAPPED_LABEL,
      isRegisteredInPeriod: false,
      isConnectedInPeriod: false,
      isPaidInPeriod: false,
      isActiveEndOfPeriod: false,
      isChurnedInPeriod: false,
      isBlockedInPeriod: false,
      expectedRevenue: 0,
      actualRevenue: 0,
      activeServiceCount: row.activeCount,
      newServiceCount: row.newCount,
      churnServiceCount: row.churnCount,
      blockServiceCount: row.blockCount,
      newConnectedCount: row.newConnectedCount,
      newPaidCount: row.newPaidCount,
      newBlockedCount: row.newBlockedCount,
      dataCompletenessStatus: row.branchId ? "complete" : "partial",
      generatedAt,
    };
  }

  private deriveOrganizationNodes(rows: MergedRow[]): OrganizationNode[] {
    const nodes = new Map<string, OrganizationNode>();

    for (const row of rows) {
      const branchId = row.branchId ?? "unmapped-branch";
      if (!nodes.has(branchId)) {
        nodes.set(branchId, {
          id: branchId,
          type: "branch",
          code: branchId,
          name: row.branchCity?.trim() || branchId,
          parentId: null,
          managerUserId: null,
          isActive: true,
        });
      }

      if (row.leadId && !nodes.has(row.leadId)) {
        nodes.set(row.leadId, {
          id: row.leadId,
          type: "lead_am",
          code: row.leadId,
          name: row.leadName?.trim() || row.leadId,
          parentId: branchId,
          managerUserId: null,
          isActive: true,
        });
      }

      if (row.amId && !nodes.has(row.amId)) {
        nodes.set(row.amId, {
          id: row.amId,
          type: "am",
          code: row.amId,
          name: row.amName?.trim() || row.amId,
          parentId: row.leadId ?? branchId,
          managerUserId: null,
          isActive: true,
        });
      }
    }

    return Array.from(nodes.values());
  }

  public async findSnapshotsByYears(years: number[], tenure: string | null = null): Promise<SnapshotsPayload> {
    const cleanYears = sanitizeYears(years);
    if (cleanYears.length === 0) {
      return { snapshots: [], nodes: [] };
    }
    const tenureKey = tenure && tenure !== "all" ? tenure : "all";

    const cacheKey = [
      "vpsales:v2:snapshots",
      DatabaseConfig.branchId,
      DatabaseConfig.serviceCategory,
      cleanYears.join(","),
      tenureKey,
    ].join(":");

    const cached = await RedisManager.get<SnapshotsPayload>(cacheKey);
    if (cached) {
      return cached;
    }

    // Years run in parallel — each is an independent, index-friendly query.
    const perYear = await Promise.all(
      cleanYears.map((y) => this.fetchYear(y, tenureKey === "all" ? null : tenureKey)),
    );
    const rows = perYear.flat();

    const generatedAt = new Date().toISOString();
    const payload: SnapshotsPayload = {
      snapshots: rows.map((r, i) => this.mapRowToSnapshot(r, i, generatedAt)),
      nodes: this.deriveOrganizationNodes(rows),
    };

    await RedisManager.set(cacheKey, payload);
    return payload;
  }
}
