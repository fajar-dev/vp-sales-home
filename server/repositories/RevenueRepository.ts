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
  RevenueDetailLevel,
  RevenueDetailParams,
  RevenuePayload,
} from "./IRevenueRepository";

interface RevenueLineRow extends RowDataPacket {
  period: string; // YYYY-MM
  billing_date: string;
  customer_service_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  address: string | null;
  branch_id: string | null;
  branch: string | null;
  service_group_id: string | null;
  service_group: string | null;
  service_id: string | null;
  service: string | null;
  manager_sales_id: string | null;
  manager_sales_name: string | null;
  sales_id: string | null;
  sales_name: string | null;
  invoice_ai: string | null;
  invoice_id: string | null;
  receipt_id: string | null;
  total: number | null;
}

const DETAIL_ENTITY_MATCH: Record<
  Exclude<RevenueDetailLevel, "revenue_gap">,
  (row: RevenueLineRow, id: string) => boolean
> = {
  branch: (r, id) => (r.branch_id ? String(r.branch_id) : "") === id,
  service_group: (r, id) => (r.service_group?.trim() || UNMAPPED_LABEL) === id,
  lead_am: (r, id) => (r.manager_sales_id ? String(r.manager_sales_id) : "") === id,
  am: (r, id) => (r.sales_id ? String(r.sales_id) : "") === id,
  service: (r, id) => (r.service_id ? String(r.service_id) : "") === id,
  customer: (r, id) => (r.customer_id ? String(r.customer_id) : "") === id,
};

export class RevenueRepository implements IRevenueRepository {
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

  private buildRevenueSql(): string {
    return /* sql */ `
      SELECT
        DATE_FORMAT(gj.TglTransaksi, '%Y-%m')            AS period,
        gj.TglTransaksi                                  AS billing_date,
        cit.CustServId                                   AS customer_service_id,
        cit.CustId                                       AS customer_id,
        c.CustName                                       AS customer_name,
        cs.installation_address                          AS address,
        SUBSTRING(gj.NoPerkiraan, -6, 3)                 AS branch_id,
        nb.BranchCity                                    AS branch,
        cit.ServiceGroup                                 AS service_group_id,
        sg.Description                                   AS service_group,
        cit.ServiceId                                    AS service_id,
        s.ServiceType                                    AS service,
        cs.ManagerSalesId                                AS manager_sales_id,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)       AS manager_sales_name,
        cs.SalesId                                       AS sales_id,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)       AS sales_name,
        nci.AI                                           AS invoice_ai,
        nci.Id                                           AS invoice_id,
        nci2.receipt_id                                  AS receipt_id,
        gj.Kredit - gj.Debet                             AS total
      FROM GeneralJournal gj
      LEFT JOIN Panjar_Penjualan_Breakdown ppb ON ppb.id = gj.SumberId AND gj.Sumber = 'pnjr'
      LEFT JOIN NewCustomerInvoice nci ON nci.AI = IFNULL(ppb.invoiceAI, gj.SumberId)
      LEFT JOIN CustomerInvoiceTemp cit ON cit.InvoiceNum = nci.Id AND cit.Urut = nci.No
      LEFT JOIN CustomerServices cs ON cs.CustServId = cit.CustServId
      LEFT JOIN Customer c ON c.CustId = cit.CustId
      LEFT JOIN NusaBranch nb ON nb.BranchId = SUBSTRING(gj.NoPerkiraan, -6, 3)
      LEFT JOIN Services s ON s.ServiceId = cit.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = cit.ServiceGroup
      LEFT JOIN Employee mgr ON mgr.EmpId = cs.ManagerSalesId
      LEFT JOIN Employee sls ON sls.EmpId = cs.SalesId
      LEFT JOIN NewCustomerInvoiceBatch ncib ON ncib.AI = nci.AI
      LEFT JOIN (
        SELECT
          ncib.batchNo,
          GROUP_CONCAT(DISTINCT nci.Id ORDER BY nci.Date DESC) AS receipt_id
        FROM NewCustomerInvoice nci
        LEFT JOIN NewCustomerInvoiceBatch ncib ON ncib.AI = nci.AI
        WHERE nci.Type LIKE 'RA%'
          AND IFNULL(nci.JournalDate, nci.TransDate) < :rangeEnd
          AND ncib.batchNo IS NOT NULL
        GROUP BY ncib.batchNo
      ) nci2 ON nci2.batchNo = ncib.batchNo
      WHERE gj.KodeCabang = :branchId
        AND s.ServiceCategory = :serviceCategory
        AND gj.NoPerkiraan LIKE '400%'
        AND gj.TglTransaksi >= :rangeStart
        AND gj.TglTransaksi < :rangeEnd
    `;
  }

  private async fetchRevenueLines(years: number[]): Promise<RevenueLineRow[]> {
    const clean = this.sanitizeYears(years);
    if (clean.length === 0) return [];
    const minYear = Math.min(...clean);
    const maxYear = Math.max(...clean);

    return DatabaseConnection.query<RevenueLineRow>(this.buildRevenueSql(), {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
      rangeStart: `${minYear}-01-01`,
      rangeEnd: `${maxYear + 1}-01-01`,
    });
  }

  private deriveNodes(rows: RevenueLineRow[]): OrganizationNode[] {
    const nodes = new Map<string, OrganizationNode>();
    for (const row of rows) {
      const branchId = this.toId(row.branch_id) ?? "unmapped-branch";
      if (!nodes.has(branchId)) {
        nodes.set(branchId, {
          id: branchId,
          type: "branch",
          code: branchId,
          name: row.branch?.trim() || branchId,
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
    const cleanYears = this.sanitizeYears(years);
    const cacheKey = `vpsales:revenue:${cleanYears.sort().join(",")}`;
    const cached = await RedisManager.get<RevenuePayload>(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await this.fetchRevenueLines(years);

    const snapshots = rows.map<ServiceMonthlySnapshot>((row, idx) => {
      const total = Number(row.total ?? 0);
      const paid = !!row.receipt_id;
      return {
        snapshotId: `rev-${row.invoice_ai ?? idx}-${idx}`,
        period: row.period,
        serviceId: this.toId(row.customer_service_id) ?? `line-${idx}`,
        productServiceId: this.toId(row.service_id) ?? "unknown-product",
        serviceType: row.service?.trim() || this.toId(row.service_id) || UNMAPPED_LABEL,
        custId: this.toId(row.customer_id) ?? "",
        branchId: this.toId(row.branch_id) ?? "unmapped-branch",
        leadId: this.toId(row.manager_sales_id),
        amId: this.toId(row.sales_id),
        serviceGroup: row.service_group?.trim() || UNMAPPED_LABEL,
        isRegisteredInPeriod: false,
        isConnectedInPeriod: false,
        isPaidInPeriod: paid,
        isActiveEndOfPeriod: true,
        isChurnedInPeriod: false,
        isBlockedInPeriod: false,
        expectedRevenue: total,
        actualRevenue: paid ? total : 0,
        activeServiceCount: 1,
        newServiceCount: 0,
        churnServiceCount: 0,
        blockServiceCount: 0,
        dataCompletenessStatus: "complete",
        generatedAt: new Date().toISOString(),
      };
    });

    const payload: RevenuePayload = { snapshots, nodes: this.deriveNodes(rows) };
    await RedisManager.set(cacheKey, payload);
    return payload;
  }

  public async findRevenueDetails(
    params: RevenueDetailParams,
    years: number[],
  ): Promise<EnrichedDetailRow[]> {
    const cleanYears = this.sanitizeYears(years);
    const cacheKey = `vpsales:revenue_detail:${JSON.stringify(params)}:${cleanYears.sort().join(",")}`;
    const cached = await RedisManager.get<EnrichedDetailRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await this.fetchRevenueLines(years);
    const isoPeriods = new Set(params.periods.filter((p) => /^\d{4}-\d{2}$/.test(p)));
    const level = params.level ?? null;

    const filtered = rows.filter((row) => {
      if (level === "revenue_gap") return !row.receipt_id;
      if (isoPeriods.size > 0 && !isoPeriods.has(row.period)) return false;
      if (level && params.entityId) {
        return DETAIL_ENTITY_MATCH[level](row, params.entityId);
      }
      return true;
    });

    filtered.sort((a, b) => {
      const byGroup = (a.service_group ?? "").localeCompare(b.service_group ?? "");
      if (byGroup !== 0) return byGroup;
      const byService = (a.service ?? "").localeCompare(b.service ?? "");
      if (byService !== 0) return byService;
      return (a.customer_id ?? "").localeCompare(b.customer_id ?? "");
    });

    const result = filtered.map<EnrichedDetailRow>((row, idx) => {
      const total = Number(row.total ?? 0);
      const paid = !!row.receipt_id;
      return {
        serviceId: this.toId(row.customer_service_id) ?? `line-${idx}`,
        serviceCode: this.toId(row.service_id),
        customerId: this.toId(row.customer_id) ?? "—",
        customerName: row.customer_name?.trim() || row.customer_id || "—",
        serviceName: row.service?.trim() || row.service_id || row.customer_service_id || "—",
        branchName: row.branch?.trim() || row.branch_id,
        leadName: row.manager_sales_name?.trim() || null,
        amName: row.sales_name?.trim() || null,
        serviceGroup: row.service_group?.trim() || UNMAPPED_LABEL,
        installationAddress: row.address?.trim() || "—",
        generatedAt: new Date().toISOString(),
        currentStatus: paid ? "active" : "blocked",
        expectedRevenue: total,
        period: row.period,
        activeDate: row.billing_date ? row.billing_date.slice(0, 10) : undefined,
        invoiceNumber: row.invoice_id ?? row.invoice_ai ?? null,
        receiptNumber: row.receipt_id ?? null,
      };
    });

    await RedisManager.set(cacheKey, result);
    return result;
  }
}
