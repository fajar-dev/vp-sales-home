import { RowDataPacket } from "mysql2";
import { DatabaseConnection } from "../db/DatabaseConnection";
import { DatabaseConfig } from "../config/DatabaseConfig";
import { billingPeriodToIso } from "@/domain/calculators/time-bucket.calculator";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";
import { UNMAPPED_LABEL } from "@/domain/constants";
import { RedisManager } from "../cache/RedisManager";
import {
  IDetailRepository,
  ServiceDetailParams,
  NewServiceDetailParams,
} from "./IDetailRepository";
import {
  ACTIVATION_SUBQUERY,
  CHURN_DATE_SUBQUERY,
  buildEntityClause,
  buildTenureClause,
  isoPeriodsToBillingList,
  serviceHasInvoiceExists,
  serviceHasPaidInvoiceExists,
} from "./sql-helpers";

const DETAIL_ROW_LIMIT = 5000;

interface DetailRowRaw extends RowDataPacket {
  period: string; // MMYY (service detail) or YYYY-MM (new service detail)
  cust_serv_id: string;
  cust_id: string;
  cust_name: string | null;
  installation_address: string | null;
  service_id: string;
  service_type: string | null;
  service_group: string | null;
  branch_id: string | null;
  branch_city: string | null;
  manager_sales_name: string | null;
  sales_name: string | null;
  status: string;
  activated_at: string | null;
  churned_at: string | null;
}

export class DetailRepository implements IDetailRepository {
  private toId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  private mapStatus(statusCode: string): string {
    if (statusCode === "AC" || statusCode === "FR") return "active";
    if (statusCode === "BL") return "blocked";
    return "churned";
  }

  private computeTenureText(activatedAt: string | null, refDateStr: string | null): string {
    if (!activatedAt) return "—";
    const start = new Date(activatedAt);
    const end = refDateStr ? new Date(refDateStr) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";

    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    if (months < 0) months = 0;

    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y > 0 && m > 0) return `${y} thn ${m} bln`;
    if (y > 0) return `${y} tahun`;
    return `${m} bulan`;
  }

  private mapRow(r: DetailRowRaw, isoPeriod: string, generatedAt: string): EnrichedDetailRow {
    const activeDate = r.activated_at ? r.activated_at.slice(0, 10) : undefined;
    const churnDate = r.churned_at ? r.churned_at.slice(0, 10) : undefined;
    const isChurned = !(r.status === "AC" || r.status === "FR") && r.status !== "BL";

    return {
      serviceId: this.toId(r.cust_serv_id) ?? "—",
      serviceCode: this.toId(r.service_id),
      customerId: this.toId(r.cust_id) ?? "—",
      customerName: r.cust_name?.trim() || r.cust_id || "—",
      serviceName: r.service_type?.trim() || r.service_id || "—",
      branchName: r.branch_city?.trim() || r.branch_id,
      leadName: r.manager_sales_name?.trim() || null,
      amName: r.sales_name?.trim() || null,
      serviceGroup: r.service_group?.trim() || UNMAPPED_LABEL,
      installationAddress: r.installation_address?.trim() || "—",
      generatedAt,
      currentStatus: this.mapStatus(r.status),
      period: isoPeriod,
      activeDate,
      churnDate,
      tenureText: this.computeTenureText(
        r.activated_at,
        isChurned ? r.churned_at ?? null : null,
      ),
    };
  }

  /**
   * Per-service rows behind an aggregated cell of the service dashboards
   * (total aktif / churn / blok). Every filter — periods, entity, metric
   * status, tenure — is applied in SQL so only relevant rows are transferred.
   */
  public async findServiceDetails(params: ServiceDetailParams): Promise<EnrichedDetailRow[]> {
    const billingList = isoPeriodsToBillingList(params.periods);
    if (!billingList) return [];

    const cacheKey = [
      "vpsales:v2:service_detail",
      DatabaseConfig.branchId,
      DatabaseConfig.serviceCategory,
      JSON.stringify(params),
    ].join(":");
    const cached = await RedisManager.get<EnrichedDetailRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const queryParams: Record<string, unknown> = {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
    };

    const entityClause = buildEntityClause(
      params.level,
      params.entityId,
      {
        branch: "IFNULL(cust.DisplayBranchId, cust.BranchId)",
        serviceGroup: "sg.Description",
        lead: "cs.ManagerSalesId",
        am: "cs.SalesId",
        service: "cse.ServiceId",
        customer: "cse.CustId",
      },
      queryParams,
    );

    let metricClause = "";
    if (params.metricMode === "churn") {
      metricClause = "AND cse.CustStatus = 'NA'";
    } else if (params.metricMode === "block") {
      metricClause = "AND cse.CustStatus = 'BL'";
    } else if (params.metricMode === "total_service") {
      metricClause = "AND cse.CustStatus IN ('AC', 'FR')";
    }

    const tenureClause = buildTenureClause(
      params.tenure,
      "act.activated_at",
      "cse.Period",
      queryParams,
    );

    const sql = /* sql */ `
      SELECT
        cse.Period                                     AS period,
        cse.CustServId                                 AS cust_serv_id,
        cse.CustId                                     AS cust_id,
        cust.CustName                                  AS cust_name,
        cs.installation_address                        AS installation_address,
        cse.ServiceId                                  AS service_id,
        s.ServiceType                                  AS service_type,
        sg.Description                                 AS service_group,
        IFNULL(cust.DisplayBranchId, cust.BranchId)    AS branch_id,
        nb.BranchCity                                  AS branch_city,
        CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
        CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
        cse.CustStatus                                 AS status,
        act.activated_at                               AS activated_at,
        churn.churned_at                               AS churned_at
      FROM CustomerServiceExcerpt cse
      JOIN CustomerServices cs ON cs.CustServId = cse.CustServId
      JOIN Customer cust       ON cust.CustId = cse.CustId
      JOIN Services s          ON s.ServiceId = cse.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN NusaBranch nb   ON nb.BranchId = IFNULL(cust.DisplayBranchId, cust.BranchId)
      LEFT JOIN Employee mgr    ON mgr.EmpId = cs.ManagerSalesId
      LEFT JOIN Employee sls    ON sls.EmpId = cs.SalesId
      LEFT JOIN (${ACTIVATION_SUBQUERY}) act ON act.cust_serv_id = cse.CustServId
      LEFT JOIN (${CHURN_DATE_SUBQUERY}) churn ON churn.custServId = cse.CustServId
      WHERE cse.Period IN (${billingList})
        AND cust.BranchId = :branchId
        AND s.ServiceCategory = :serviceCategory
        ${metricClause}
        ${entityClause}
        ${tenureClause}
      ORDER BY sg.Description, s.ServiceType, cse.CustId
      LIMIT ${DETAIL_ROW_LIMIT}
    `;

    const rows = await DatabaseConnection.query<DetailRowRaw>(sql, queryParams);
    const generatedAt = new Date().toISOString();
    const result = rows.map((r) => this.mapRow(r, billingPeriodToIso(r.period), generatedAt));

    await RedisManager.set(cacheKey, result);
    return result;
  }

  /**
   * Per-service rows behind the "layanan baru" dashboards. Rows are driven by
   * first-activation date; `subMetric` narrows to the clicked funnel stage
   * (homeconnect = invoiced, homepaid = invoice paid, block = currently BL).
   */
  public async findNewServiceDetails(params: NewServiceDetailParams): Promise<EnrichedDetailRow[]> {
    const periods = params.periods.filter((p) => /^\d{4}-\d{2}$/.test(p));
    if (periods.length === 0) return [];

    const cacheKey = [
      "vpsales:v2:new_service_detail",
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

    const entityClause = buildEntityClause(
      params.level,
      params.entityId,
      {
        branch: "IFNULL(cust.DisplayBranchId, cust.BranchId)",
        serviceGroup: "sg.Description",
        lead: "cs.ManagerSalesId",
        am: "cs.SalesId",
        service: "cs.ServiceId",
        customer: "cs.CustId",
      },
      queryParams,
    );

    // The funnel flags are computed in the inner SELECT and filtered in the
    // outer query. Putting the EXISTS chains straight into WHERE makes the
    // optimizer pick a semijoin plan that is ~20× slower; the derived table
    // forces per-row evaluation, matching the fast aggregate query plan.
    let subMetricFilter = "";
    if (params.subMetric === "homeconnect") {
      subMetricFilter = "WHERE t.has_invoice = 1";
    } else if (params.subMetric === "homepaid") {
      subMetricFilter = "WHERE t.has_paid = 1";
    } else if (params.subMetric === "block") {
      subMetricFilter = "WHERE t.status = 'BL'";
    }

    const periodList = periods.map((p) => `'${p}'`).join(", ");

    const sql = /* sql */ `
      SELECT t.*
      FROM (
        SELECT
          DATE_FORMAT(act.activated_at, '%Y-%m')         AS period,
          cs.CustServId                                  AS cust_serv_id,
          cs.CustId                                      AS cust_id,
          cust.CustName                                  AS cust_name,
          cs.installation_address                        AS installation_address,
          cs.ServiceId                                   AS service_id,
          s.ServiceType                                  AS service_type,
          sg.Description                                 AS service_group,
          IFNULL(cust.DisplayBranchId, cust.BranchId)    AS branch_id,
          nb.BranchCity                                  AS branch_city,
          CONCAT_WS(' ', mgr.EmpFName, mgr.EmpLName)     AS manager_sales_name,
          CONCAT_WS(' ', sls.EmpFName, sls.EmpLName)     AS sales_name,
          cs.CustStatus                                  AS status,
          act.activated_at                               AS activated_at,
          NULL                                           AS churned_at,
          ${serviceHasInvoiceExists("cs.CustServId")}     AS has_invoice,
          ${serviceHasPaidInvoiceExists("cs.CustServId")} AS has_paid
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
          AND DATE_FORMAT(act.activated_at, '%Y-%m') IN (${periodList})
          ${entityClause}
      ) t
      ${subMetricFilter}
      ORDER BY t.service_group, t.service_type, t.cust_id
      LIMIT ${DETAIL_ROW_LIMIT}
    `;

    const rows = await DatabaseConnection.query<DetailRowRaw>(sql, queryParams);
    const generatedAt = new Date().toISOString();
    const result = rows.map((r) => this.mapRow(r, r.period, generatedAt));

    await RedisManager.set(cacheKey, result);
    return result;
  }
}
