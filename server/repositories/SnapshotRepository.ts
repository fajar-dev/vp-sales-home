import { RowDataPacket } from "mysql2";
import { DatabaseConnection } from "../db/DatabaseConnection";
import { DatabaseConfig } from "../config/DatabaseConfig";
import { billingPeriodToIso, isActiveStatus } from "@/domain/calculators/time-bucket.calculator";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import { UNMAPPED_LABEL } from "@/domain/constants";
import { ISnapshotRepository, SnapshotsPayload } from "./ISnapshotRepository";

interface SnapshotRow extends RowDataPacket {
  period: string; // MMYY
  cust_serv_id: string;
  cust_id: string;
  service_id: string;
  service_type: string | null;
  service_group_id: string | null;
  service_group: string | null;
  branch_id: string | null;
  branch_city: string | null;
  manager_sales_id: string | null;
  manager_sales_name: string | null;
  sales_id: string | null;
  sales_name: string | null;
  status: string;
  activated_at: string | null; // YYYY-MM-DD HH:MM:SS
}

export class SnapshotRepository implements ISnapshotRepository {
  private toId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  private sanitizeYears(years: number[]): number[] {
    const clean = years
      .map((y) => Math.trunc(Number(y)))
      .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100);
    return Array.from(new Set(clean));
  }

  private buildSnapshotSql(years: number[]): string {
    const yySuffixes = years.map((y) => `'${String(y).slice(2)}'`).join(", ");

    return /* sql */ `
      SELECT
        cse.Period                                         AS period,
        cse.CustServId                                     AS cust_serv_id,
        cse.CustId                                         AS cust_id,
        cse.ServiceId                                      AS service_id,
        s.ServiceType                                      AS service_type,
        s.ServiceGroup                                     AS service_group_id,
        sg.Description                                     AS service_group,
        c.BranchId                                         AS branch_id,
        c.BranchCity                                       AS branch_city,
        c.ManagerSalesId                                   AS manager_sales_id,
        c.manager_sales_name                               AS manager_sales_name,
        c.SalesId                                          AS sales_id,
        c.sales_name                                       AS sales_name,
        cse.CustStatus                                     AS status,
        act.activated_at                                   AS activated_at
      FROM CustomerServiceExcerpt cse
      LEFT JOIN Services s      ON s.ServiceId = cse.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN (
        SELECT
          cs.CustServId,
          IFNULL(c.DisplayBranchId, c.BranchId)                AS BranchId,
          nb.BranchCity,
          cs.ManagerSalesId,
          CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)           AS manager_sales_name,
          cs.SalesId,
          CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)           AS sales_name
        FROM CustomerServices cs
        LEFT JOIN Customer c    ON c.CustId = cs.CustId
        LEFT JOIN NusaBranch nb ON nb.BranchId = IFNULL(c.DisplayBranchId, c.BranchId)
        LEFT JOIN Employee mgr  ON mgr.EmpId = cs.ManagerSalesId
        LEFT JOIN Employee sls  ON sls.EmpId = cs.SalesId
      ) c ON c.CustServId = cse.CustServId
      LEFT JOIN (
        SELECT
          cs.CustServId                                        AS cust_serv_id,
          IFNULL(csact2.activated_at, csact.activation_date)   AS activated_at
        FROM CustomerServices cs
        LEFT JOIN (
          SELECT cshn.cust_serv_id, MIN(cshn.insert_time) AS activation_date
          FROM CustomerServicesHistoryNew cshn
          WHERE cshn.description LIKE 'Activation%'
             OR cshn.description LIKE 'Free%'
          GROUP BY cshn.cust_serv_id
        ) csact ON csact.cust_serv_id = cs.CustServId
        LEFT JOIN (
          SELECT
            cscsl.custServId,
            cscsl.insertTime AS activated_at,
            ROW_NUMBER() OVER (
              PARTITION BY cscsl.custServId
              ORDER BY cscsl.insertTime ASC
            ) AS rn
          FROM CustomerServiceChangeStatusLog cscsl
          WHERE cscsl.status IN ('AC', 'FR')
        ) csact2 ON csact2.custServId = cs.CustServId AND csact2.rn = 1
      ) act ON act.cust_serv_id = cse.CustServId
      WHERE cse.CustId IN (
        SELECT CustId FROM Customer WHERE BranchId = :branchId
      )
      AND s.ServiceCategory = :serviceCategory
      AND RIGHT(cse.Period, 2) IN (${yySuffixes})
    `;
  }

  private activatedInPeriod(activatedAt: string | null, isoPeriod: string): boolean {
    if (!activatedAt) return false;
    return activatedAt.slice(0, 7) === isoPeriod;
  }

  private mapRowToSnapshot(row: SnapshotRow): ServiceMonthlySnapshot {
    const isoPeriod = billingPeriodToIso(row.period);
    const active = isActiveStatus(row.status);
    const blocked = row.status === "BL";
    const churned = row.status === "NA";
    const isNew = this.activatedInPeriod(row.activated_at, isoPeriod);

    return {
      snapshotId: `${row.period}-${row.cust_serv_id}`,
      period: isoPeriod,
      serviceId: this.toId(row.cust_serv_id) ?? "unknown-service",
      productServiceId: this.toId(row.service_id) ?? "unknown-product",
      serviceType: row.service_type?.trim() || this.toId(row.service_id) || UNMAPPED_LABEL,
      custId: this.toId(row.cust_id) ?? "",
      branchId: this.toId(row.branch_id) ?? "unmapped-branch",
      leadId: this.toId(row.manager_sales_id),
      amId: this.toId(row.sales_id),
      serviceGroup: row.service_group?.trim() || UNMAPPED_LABEL,
      isRegisteredInPeriod: isNew,
      isConnectedInPeriod: isNew,
      isPaidInPeriod: false,
      isActiveEndOfPeriod: active,
      isChurnedInPeriod: churned,
      isBlockedInPeriod: blocked,
      expectedRevenue: 0,
      actualRevenue: 0,
      activeServiceCount: active ? 1 : 0,
      newServiceCount: isNew ? 1 : 0,
      churnServiceCount: churned ? 1 : 0,
      blockServiceCount: blocked ? 1 : 0,
      dataCompletenessStatus: row.branch_id ? "complete" : "partial",
      generatedAt: new Date().toISOString(),
    };
  }

  private deriveOrganizationNodes(rows: SnapshotRow[]): OrganizationNode[] {
    const nodes = new Map<string, OrganizationNode>();

    for (const row of rows) {
      const branchId = this.toId(row.branch_id) ?? "unmapped-branch";
      if (!nodes.has(branchId)) {
        nodes.set(branchId, {
          id: branchId,
          type: "branch",
          code: branchId,
          name: row.branch_city?.trim() || branchId,
          parentId: null,
          managerUserId: null,
          isActive: true,
        });
      }

      const leadId = this.toId(row.manager_sales_id);
      if (leadId && !nodes.has(leadId)) {
        nodes.set(leadId, {
          id: leadId,
          type: "lead_am",
          code: leadId,
          name: row.manager_sales_name?.trim() || leadId,
          parentId: branchId,
          managerUserId: null,
          isActive: true,
        });
      }

      const amId = this.toId(row.sales_id);
      if (amId && !nodes.has(amId)) {
        nodes.set(amId, {
          id: amId,
          type: "am",
          code: amId,
          name: row.sales_name?.trim() || amId,
          parentId: leadId ?? branchId,
          managerUserId: null,
          isActive: true,
        });
      }
    }

    return Array.from(nodes.values());
  }

  public async findSnapshotsByYears(years: number[]): Promise<SnapshotsPayload> {
    const cleanYears = this.sanitizeYears(years);
    if (cleanYears.length === 0) {
      return { snapshots: [], nodes: [] };
    }

    const rows = await DatabaseConnection.query<SnapshotRow>(
      this.buildSnapshotSql(cleanYears),
      {
        branchId: DatabaseConfig.branchId,
        serviceCategory: DatabaseConfig.serviceCategory,
      },
    );

    return {
      snapshots: rows.map((r) => this.mapRowToSnapshot(r)),
      nodes: this.deriveOrganizationNodes(rows),
    };
  }
}
