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

interface DetailRowRaw extends RowDataPacket {
  period: string; // MMYY
  cust_serv_id: string;
  cust_id: string;
  cust_name: string | null;
  installation_address: string | null;
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
  activated_at: string | null;
  churned_at: string | null;
}

const DETAIL_ENTITY_WHERE: Record<
  string,
  (paramName: string) => string
> = {
  branch: (p) => `AND c.BranchId = :${p}`,
  service_group: (p) => `AND sg.Description = :${p}`,
  lead_am: (p) => `AND c.ManagerSalesId = :${p}`,
  am: (p) => `AND c.SalesId = :${p}`,
  service: (p) => `AND cse.ServiceId = :${p}`,
  customer: (p) => `AND cse.CustId = :${p}`,
};

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

  private buildServiceDetailSql(params: ServiceDetailParams): { sql: string; queryParams: Record<string, unknown> } {
    const periods = params.periods.filter((p) => /^\d{4}-\d{2}$/.test(p));
    const yyList = periods.map((p) => `'${p.slice(2, 4)}'`).join(", ");

    const queryParams: Record<string, unknown> = {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
    };

    let entityClause = "";
    if (params.level && params.entityId && DETAIL_ENTITY_WHERE[params.level]) {
      entityClause = DETAIL_ENTITY_WHERE[params.level]("entityId");
      queryParams.entityId = params.entityId;
    }

    let metricClause = "";
    if (params.metricMode === "churn") {
      metricClause = "AND cse.CustStatus = 'NA'";
    } else if (params.metricMode === "total_service") {
      metricClause = "AND cse.CustStatus IN ('AC', 'FR')";
    }

    const sql = /* sql */ `
      SELECT
        cse.Period                                         AS period,
        cse.CustServId                                     AS cust_serv_id,
        cse.CustId                                         AS cust_id,
        cust.CustName                                      AS cust_name,
        cs.installation_address                            AS installation_address,
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
        act.activated_at                                   AS activated_at,
        churn.churned_at                                   AS churned_at
      FROM CustomerServiceExcerpt cse
      LEFT JOIN Services s      ON s.ServiceId = cse.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN CustomerServices cs ON cs.CustServId = cse.CustServId
      LEFT JOIN Customer cust   ON cust.CustId = cse.CustId
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
          WHERE cshn.description LIKE 'Activation%' OR cshn.description LIKE 'Free%'
          GROUP BY cshn.cust_serv_id
        ) csact ON csact.cust_serv_id = cs.CustServId
        LEFT JOIN (
          SELECT
            cscsl.custServId,
            cscsl.insertTime AS activated_at,
            ROW_NUMBER() OVER (PARTITION BY cscsl.custServId ORDER BY cscsl.insertTime ASC) AS rn
          FROM CustomerServiceChangeStatusLog cscsl
          WHERE cscsl.status IN ('AC', 'FR')
        ) csact2 ON csact2.custServId = cs.CustServId AND csact2.rn = 1
      ) act ON act.cust_serv_id = cse.CustServId
      LEFT JOIN (
        SELECT
          cscsl.custServId,
          cscsl.insertTime AS churned_at,
          ROW_NUMBER() OVER (PARTITION BY cscsl.custServId ORDER BY cscsl.insertTime DESC) AS rn
        FROM CustomerServiceChangeStatusLog cscsl
        WHERE cscsl.status = 'NA'
      ) churn ON churn.custServId = cse.CustServId AND churn.rn = 1
      WHERE cse.CustId IN (
        SELECT CustId FROM Customer WHERE BranchId = :branchId
      )
      AND s.ServiceCategory = :serviceCategory
      AND RIGHT(cse.Period, 2) IN (${yyList})
      ${metricClause}
      ${entityClause}
    `;

    return { sql, queryParams };
  }

  public async findServiceDetails(params: ServiceDetailParams): Promise<EnrichedDetailRow[]> {
    const cacheKey = `vpsales:service_detail:${JSON.stringify(params)}`;
    const cached = await RedisManager.get<EnrichedDetailRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { sql, queryParams } = this.buildServiceDetailSql(params);
    const rows = await DatabaseConnection.query<DetailRowRaw>(sql, queryParams);

    const targetIsoPeriods = new Set(params.periods);
    const filtered = rows.filter((r) => targetIsoPeriods.has(billingPeriodToIso(r.period)));

    filtered.sort((a, b) => {
      const gComp = (a.service_group ?? "").localeCompare(b.service_group ?? "");
      if (gComp !== 0) return gComp;
      const sComp = (a.service_type ?? "").localeCompare(b.service_type ?? "");
      if (sComp !== 0) return sComp;
      return (a.cust_id ?? "").localeCompare(b.cust_id ?? "");
    });

    const result = filtered.map<EnrichedDetailRow>((r) => {
      const isoPeriod = billingPeriodToIso(r.period);
      const activeDate = r.activated_at ? r.activated_at.slice(0, 10) : undefined;
      const churnDate = r.churned_at ? r.churned_at.slice(0, 10) : undefined;
      const tenureText = this.computeTenureText(r.activated_at, r.churned_at ?? null);

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
        generatedAt: new Date().toISOString(),
        currentStatus: this.mapStatus(r.status),
        period: isoPeriod,
        activeDate,
        churnDate,
        tenureText,
      };
    });

    await RedisManager.set(cacheKey, result);
    return result;
  }

  public async findNewServiceDetails(params: NewServiceDetailParams): Promise<EnrichedDetailRow[]> {
    const periods = params.periods.filter((p) => /^\d{4}-\d{2}$/.test(p));
    if (periods.length === 0) return [];

    const cacheKey = `vpsales:new_service_detail:${JSON.stringify(params)}`;
    const cached = await RedisManager.get<EnrichedDetailRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const minPeriod = periods.reduce((a, b) => (a < b ? a : b));
    const maxPeriod = periods.reduce((a, b) => (a > b ? a : b));
    const rangeStart = `${minPeriod}-01 00:00:00`;
    const [maxY, maxM] = maxPeriod.split("-").map(Number);
    const nextM = maxM === 12 ? 1 : maxM + 1;
    const nextY = maxM === 12 ? maxY + 1 : maxY;
    const rangeEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01 00:00:00`;

    const queryParams: Record<string, unknown> = {
      branchId: DatabaseConfig.branchId,
      serviceCategory: DatabaseConfig.serviceCategory,
      rangeStart,
      rangeEnd,
    };

    let entityClause = "";
    if (params.level && params.entityId && DETAIL_ENTITY_WHERE[params.level]) {
      entityClause = DETAIL_ENTITY_WHERE[params.level]("entityId");
      queryParams.entityId = params.entityId;
    }

    const sql = /* sql */ `
      SELECT
        DATE_FORMAT(act.activated_at, '%Y-%m')             AS period,
        cs.CustServId                                      AS cust_serv_id,
        cs.CustId                                          AS cust_id,
        cust.CustName                                      AS cust_name,
        cs.installation_address                            AS installation_address,
        cs.ServiceId                                       AS service_id,
        s.ServiceType                                      AS service_type,
        s.ServiceGroup                                     AS service_group_id,
        sg.Description                                     AS service_group,
        c.BranchId                                         AS branch_id,
        c.BranchCity                                       AS branch_city,
        c.ManagerSalesId                                   AS manager_sales_id,
        c.manager_sales_name                               AS manager_sales_name,
        cs.SalesId                                         AS sales_id,
        c.sales_name                                       AS sales_name,
        cs.CustStatus                                      AS status,
        act.activated_at                                   AS activated_at
      FROM CustomerServices cs
      JOIN (
        SELECT
          cs.CustServId                                        AS cust_serv_id,
          IFNULL(csact2.activated_at, csact.activation_date)   AS activated_at
        FROM CustomerServices cs
        LEFT JOIN (
          SELECT cshn.cust_serv_id, MIN(cshn.insert_time) AS activation_date
          FROM CustomerServicesHistoryNew cshn
          WHERE cshn.description LIKE 'Activation%' OR cshn.description LIKE 'Free%'
          GROUP BY cshn.cust_serv_id
        ) csact ON csact.cust_serv_id = cs.CustServId
        LEFT JOIN (
          SELECT
            cscsl.custServId,
            cscsl.insertTime AS activated_at,
            ROW_NUMBER() OVER (PARTITION BY cscsl.custServId ORDER BY cscsl.insertTime ASC) AS rn
          FROM CustomerServiceChangeStatusLog cscsl
          WHERE cscsl.status IN ('AC', 'FR')
        ) csact2 ON csact2.custServId = cs.CustServId AND csact2.rn = 1
      ) act ON act.cust_serv_id = cs.CustServId
      LEFT JOIN Services s      ON s.ServiceId = cs.ServiceId
      LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
      LEFT JOIN Customer cust   ON cust.CustId = cs.CustId
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
      ) c ON c.CustServId = cs.CustServId
      WHERE cs.CustId IN (
        SELECT CustId FROM Customer WHERE BranchId = :branchId
      )
      AND s.ServiceCategory = :serviceCategory
      AND act.activated_at >= :rangeStart
      AND act.activated_at < :rangeEnd
      ${entityClause}
    `;

    const rows = await DatabaseConnection.query<DetailRowRaw>(sql, queryParams);

    const targetIsoPeriods = new Set(periods);
    const filtered = rows.filter((r) => r.period && targetIsoPeriods.has(r.period));

    filtered.sort((a, b) => {
      const gComp = (a.service_group ?? "").localeCompare(b.service_group ?? "");
      if (gComp !== 0) return gComp;
      const sComp = (a.service_type ?? "").localeCompare(b.service_type ?? "");
      if (sComp !== 0) return sComp;
      return (a.cust_id ?? "").localeCompare(b.cust_id ?? "");
    });

    const result = filtered.map<EnrichedDetailRow>((r) => {
      const activeDate = r.activated_at ? r.activated_at.slice(0, 10) : undefined;
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
        generatedAt: new Date().toISOString(),
        currentStatus: this.mapStatus(r.status),
        period: r.period,
        activeDate,
      };
    });

    await RedisManager.set(cacheKey, result);
    return result;
  }
}
