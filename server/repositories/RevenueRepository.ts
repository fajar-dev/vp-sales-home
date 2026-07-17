import { RowDataPacket } from "mysql2";
import { DatabaseConnection } from "../db/DatabaseConnection";
import { DatabaseConfig } from "../config/DatabaseConfig";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";
import { UNMAPPED_LABEL } from "@/domain/constants";
import { RedisManager } from "../cache/RedisManager";
import {
  IRevenueRepository,
  RevenueDetailParams,
  RevenuePayload,
} from "./IRevenueRepository";
import {
  buildEntityClause,
  paidBatchExists,
  sanitizeYears,
} from "./sql-helpers";

const DETAIL_ROW_LIMIT = 5000;

interface RevenueAggRow extends RowDataPacket {
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
  line_count: string | number;
  total: string | number | null;
  paid_total: string | number | null;
}

interface RevenueDetailRow extends RowDataPacket {
  iso_period: string;
  billing_date: string | null;
  customer_service_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  address: string | null;
  branch_id: string | null;
  branch: string | null;
  service_group: string | null;
  service_id: string | null;
  service: string | null;
  manager_sales_name: string | null;
  sales_name: string | null;
  invoice_ai: string | null;
  invoice_id: string | null;
  receipt_id: string | null;
  total: string | number | null;
}

/** Journal-line source shared by the aggregate & detail queries. */
const REVENUE_FROM = /* sql */ `
  FROM GeneralJournal gj
  LEFT JOIN Panjar_Penjualan_Breakdown ppb ON ppb.id = gj.SumberId AND gj.Sumber = 'pnjr'
  LEFT JOIN NewCustomerInvoice nci ON nci.AI = IFNULL(ppb.invoiceAI, gj.SumberId)
  LEFT JOIN CustomerInvoiceTemp cit ON cit.InvoiceNum = nci.Id AND cit.Urut = nci.No
  JOIN Services s ON s.ServiceId = cit.ServiceId AND s.ServiceCategory = :serviceCategory
  LEFT JOIN CustomerServices cs ON cs.CustServId = cit.CustServId
  LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = cit.ServiceGroup
  LEFT JOIN NusaBranch nb ON nb.BranchId = SUBSTRING(gj.NoPerkiraan, -6, 3)
  LEFT JOIN Employee mgr ON mgr.EmpId = cs.ManagerSalesId
  LEFT JOIN Employee sls ON sls.EmpId = cs.SalesId
  LEFT JOIN NewCustomerInvoiceBatch ncib ON ncib.AI = nci.AI
`;

/** Predicate: this journal line's invoice batch has a receipt (is paid). */
const PAID_CONDITION = `(ncib.batchNo IS NOT NULL AND ${paidBatchExists("ncib.batchNo")})`;

export class RevenueRepository implements IRevenueRepository {
  private toId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  private buildAggregateSql(): string {
    return /* sql */ `
      SELECT
        DATE_FORMAT(gj.TglTransaksi, '%Y-%m')          AS iso_period,
        SUBSTRING(gj.NoPerkiraan, -6, 3)               AS branch_id,
        nb.BranchCity                                  AS branch_city,
        sg.Description                                 AS service_group,
        cit.ServiceId                                  AS service_id,
        s.ServiceType                                  AS service_type,
        cs.ManagerSalesId                              AS manager_sales_id,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
        cs.SalesId                                     AS sales_id,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
        COUNT(*)                                       AS line_count,
        SUM(gj.Kredit - gj.Debet)                      AS total,
        SUM(CASE WHEN ${PAID_CONDITION} THEN gj.Kredit - gj.Debet ELSE 0 END) AS paid_total
      ${REVENUE_FROM}
      WHERE gj.KodeCabang = :branchId
        AND gj.NoPerkiraan LIKE '400%'
        AND gj.TglTransaksi >= :rangeStart
        AND gj.TglTransaksi < :rangeEnd
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    `;
  }

  private async fetchYearAggregate(year: number): Promise<RevenueAggRow[]> {
    return DatabaseConnection.query<RevenueAggRow>(this.buildAggregateSql(), {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
      rangeStart: `${year}-01-01`,
      rangeEnd: `${year + 1}-01-01`,
    });
  }

  private deriveNodes(rows: RevenueAggRow[]): OrganizationNode[] {
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

  public async findRevenueSnapshotsByYears(years: number[]): Promise<RevenuePayload> {
    const cleanYears = sanitizeYears(years);
    if (cleanYears.length === 0) {
      return { snapshots: [], nodes: [] };
    }

    const cacheKey = [
      "vpsales:v2:revenue",
      DatabaseConfig.branchId,
      DatabaseConfig.serviceCategory,
      cleanYears.join(","),
    ].join(":");

    const cached = await RedisManager.get<RevenuePayload>(cacheKey);
    if (cached) {
      return cached;
    }

    const perYear = await Promise.all(cleanYears.map((y) => this.fetchYearAggregate(y)));
    const rows = perYear.flat();

    const generatedAt = new Date().toISOString();
    const snapshots = rows.map<ServiceMonthlySnapshot>((row, idx) => {
      const total = Number(row.total ?? 0);
      const paidTotal = Number(row.paid_total ?? 0);
      return {
        snapshotId: `rev-${row.iso_period}-${idx}`,
        period: row.iso_period,
        serviceId: `rev-${row.iso_period}-grp-${idx}`,
        productServiceId: this.toId(row.service_id) ?? "unknown-product",
        serviceType: row.service_type?.trim() || this.toId(row.service_id) || UNMAPPED_LABEL,
        custId: "",
        branchId: this.toId(row.branch_id) ?? "unmapped-branch",
        leadId: this.toId(row.manager_sales_id),
        amId: this.toId(row.sales_id),
        serviceGroup: row.service_group?.trim() || UNMAPPED_LABEL,
        isRegisteredInPeriod: false,
        isConnectedInPeriod: false,
        isPaidInPeriod: paidTotal > 0,
        isActiveEndOfPeriod: false,
        isChurnedInPeriod: false,
        isBlockedInPeriod: false,
        expectedRevenue: total,
        actualRevenue: paidTotal,
        activeServiceCount: Number(row.line_count) || 0,
        newServiceCount: 0,
        churnServiceCount: 0,
        blockServiceCount: 0,
        newConnectedCount: 0,
        newPaidCount: 0,
        newBlockedCount: 0,
        dataCompletenessStatus: "complete",
        generatedAt,
      };
    });

    const payload: RevenuePayload = { snapshots, nodes: this.deriveNodes(rows) };
    await RedisManager.set(cacheKey, payload);
    return payload;
  }

  public async findRevenueDetails(params: RevenueDetailParams): Promise<EnrichedDetailRow[]> {
    const periods = params.periods.filter((p) => /^\d{4}-\d{2}$/.test(p));
    if (periods.length === 0) return [];

    const cacheKey = [
      "vpsales:v2:revenue_detail",
      DatabaseConfig.branchId,
      DatabaseConfig.serviceCategory,
      JSON.stringify({ ...params, periods }),
    ].join(":");
    const cached = await RedisManager.get<EnrichedDetailRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const minPeriod = periods.reduce((a, b) => (a < b ? a : b));
    const maxPeriod = periods.reduce((a, b) => (a > b ? a : b));
    const [maxY, maxM] = maxPeriod.split("-").map(Number);
    const rangeEnd =
      maxM === 12
        ? `${maxY + 1}-01-01`
        : `${maxY}-${String(maxM + 1).padStart(2, "0")}-01`;

    const queryParams: Record<string, unknown> = {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
      rangeStart: `${minPeriod}-01`,
      rangeEnd,
    };

    // The `revenue_gap` pseudo-level means "unpaid lines" — no entity filter.
    const level = params.level === "revenue_gap" ? null : params.level;
    const entityClause = buildEntityClause(
      level,
      params.entityId === "revenue_gap" ? null : params.entityId,
      {
        branch: "SUBSTRING(gj.NoPerkiraan, -6, 3)",
        serviceGroup: "sg.Description",
        lead: "cs.ManagerSalesId",
        am: "cs.SalesId",
        service: "cit.ServiceId",
        customer: "cit.CustId",
      },
      queryParams,
    );

    const periodList = periods.map((p) => `'${p}'`).join(", ");
    const unpaidClause =
      params.unpaidOnly || params.level === "revenue_gap"
        ? `AND NOT ${PAID_CONDITION}`
        : "";

    const sql = /* sql */ `
      SELECT
        DATE_FORMAT(gj.TglTransaksi, '%Y-%m')          AS iso_period,
        gj.TglTransaksi                                AS billing_date,
        cit.CustServId                                 AS customer_service_id,
        cit.CustId                                     AS customer_id,
        c.CustName                                     AS customer_name,
        cs.installation_address                        AS address,
        SUBSTRING(gj.NoPerkiraan, -6, 3)               AS branch_id,
        nb.BranchCity                                  AS branch,
        sg.Description                                 AS service_group,
        cit.ServiceId                                  AS service_id,
        s.ServiceType                                  AS service,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
        nci.AI                                         AS invoice_ai,
        nci.Id                                         AS invoice_id,
        CASE WHEN ncib.batchNo IS NOT NULL THEN (
          SELECT GROUP_CONCAT(DISTINCT pr.Id ORDER BY pr.Date DESC)
          FROM NewCustomerInvoiceBatch pb
          JOIN NewCustomerInvoice pr ON pr.AI = pb.AI
          WHERE pb.batchNo = ncib.batchNo
            AND pr.Type LIKE 'RA%'
        ) ELSE NULL END                                AS receipt_id,
        gj.Kredit - gj.Debet                           AS total
      ${REVENUE_FROM}
      LEFT JOIN Customer c ON c.CustId = cit.CustId
      WHERE gj.KodeCabang = :branchId
        AND gj.NoPerkiraan LIKE '400%'
        AND gj.TglTransaksi >= :rangeStart
        AND gj.TglTransaksi < :rangeEnd
        AND DATE_FORMAT(gj.TglTransaksi, '%Y-%m') IN (${periodList})
        ${unpaidClause}
        ${entityClause}
      ORDER BY sg.Description, s.ServiceType, cit.CustId, gj.TglTransaksi
      LIMIT ${DETAIL_ROW_LIMIT}
    `;

    const rows = await DatabaseConnection.query<RevenueDetailRow>(sql, queryParams);

    const generatedAt = new Date().toISOString();
    const result = rows.map<EnrichedDetailRow>((row, idx) => {
      const total = Number(row.total ?? 0);
      const paid = !!row.receipt_id;
      return {
        serviceId: this.toId(row.customer_service_id) ?? `line-${idx}`,
        serviceCode: this.toId(row.service_id),
        customerId: this.toId(row.customer_id) ?? "—",
        customerName: row.customer_name?.trim() || row.customer_id || "—",
        serviceName: row.service?.trim() || row.service_id || "—",
        branchName: row.branch?.trim() || row.branch_id,
        leadName: row.manager_sales_name?.trim() || null,
        amName: row.sales_name?.trim() || null,
        serviceGroup: row.service_group?.trim() || UNMAPPED_LABEL,
        installationAddress: row.address?.trim() || "—",
        generatedAt,
        currentStatus: paid ? "active" : "blocked",
        expectedRevenue: total,
        period: row.iso_period,
        activeDate: row.billing_date ? row.billing_date.slice(0, 10) : undefined,
        invoiceNumber: row.invoice_id ?? row.invoice_ai ?? null,
        receiptNumber: row.receipt_id ?? null,
      };
    });

    await RedisManager.set(cacheKey, result);
    return result;
  }
}
