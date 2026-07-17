/**
 * Shared SQL building blocks for the reporting repositories.
 *
 * All fragments assume named placeholders (`:branchId`, `:serviceCategory`)
 * provided by the caller. Dynamic lists (periods/years) must be sanitized by
 * the caller before interpolation — helpers here only accept values that have
 * already passed a strict whitelist (regex/numeric).
 */

/**
 * First-activation date per customer service, scoped to the report branch and
 * service category. Primary source: first AC/FR entry in the status-change
 * log; fallback: first "Activation%"/"Free%" entry in the service history.
 */
export const ACTIVATION_SUBQUERY = /* sql */ `
  SELECT
    cs2.CustServId                     AS cust_serv_id,
    IFNULL(l.first_ac, h.first_act)    AS activated_at
  FROM CustomerServices cs2
  JOIN Customer c2 ON c2.CustId = cs2.CustId AND c2.BranchId = :branchId
  JOIN Services s2 ON s2.ServiceId = cs2.ServiceId AND s2.ServiceCategory = :serviceCategory
  LEFT JOIN (
    SELECT custServId, MIN(insertTime) AS first_ac
    FROM CustomerServiceChangeStatusLog
    WHERE status IN ('AC', 'FR')
    GROUP BY custServId
  ) l ON l.custServId = cs2.CustServId
  LEFT JOIN (
    SELECT cust_serv_id, MIN(insert_time) AS first_act
    FROM CustomerServicesHistoryNew
    WHERE description LIKE 'Activation%' OR description LIKE 'Free%'
    GROUP BY cust_serv_id
  ) h ON h.cust_serv_id = cs2.CustServId
`;

/** Latest churn (NA) date per customer service. Small table — cheap. */
export const CHURN_DATE_SUBQUERY = /* sql */ `
  SELECT custServId, MAX(insertTime) AS churned_at
  FROM CustomerServiceChangeStatusLog
  WHERE status = 'NA'
  GROUP BY custServId
`;

/**
 * `EXISTS` predicate: the invoice batch identified by `batchNoExpr` has been
 * paid (a receipt "RA%" invoice exists in the same batch).
 */
export function paidBatchExists(batchNoExpr: string): string {
  return /* sql */ `EXISTS (
    SELECT 1
    FROM NewCustomerInvoiceBatch pb
    JOIN NewCustomerInvoice pr ON pr.AI = pb.AI
    WHERE pb.batchNo = ${batchNoExpr}
      AND pr.Type LIKE 'RA%'
  )`;
}

/** `EXISTS`: the service has at least one live (non-reversed) invoice line. */
export function serviceHasInvoiceExists(custServIdExpr: string): string {
  return /* sql */ `EXISTS (
    SELECT 1 FROM CustomerInvoiceTemp ci
    WHERE ci.CustServId = ${custServIdExpr}
      AND ci.RInvoiceNum = 0
      AND ci.Reverse = 0
  )`;
}

/** `EXISTS`: the service has at least one invoice line whose batch is paid. */
export function serviceHasPaidInvoiceExists(custServIdExpr: string): string {
  return /* sql */ `EXISTS (
    SELECT 1
    FROM CustomerInvoiceTemp ci
    JOIN NewCustomerInvoice ni ON ni.Id = ci.InvoiceNum AND ni.No = ci.Urut
    JOIN NewCustomerInvoiceBatch nb ON nb.AI = ni.AI
    WHERE ci.CustServId = ${custServIdExpr}
      AND ci.RInvoiceNum = 0
      AND ci.Reverse = 0
      AND ${paidBatchExists("nb.batchNo")}
  )`;
}

/** Frontend sentinel ids for rows without a real entity behind them. */
export const UNASSIGNED_LEAD_ID = "unassigned-lead";
export const UNASSIGNED_AM_ID = "unassigned-am";
export const UNMAPPED_GROUP_ID = "Unmapped";

export interface EntityColumnExprs {
  branch: string;
  serviceGroup: string;
  lead: string;
  am: string;
  service: string;
  customer: string;
}

/**
 * Builds the `AND <column> = :entityId` clause for a drill-down entity,
 * translating the frontend sentinel ids (Unmapped / Unassigned) into
 * `IS NULL OR = ''` conditions. Mutates `params` when a placeholder is used.
 */
export function buildEntityClause(
  level: string | null | undefined,
  entityId: string | null | undefined,
  exprs: EntityColumnExprs,
  params: Record<string, unknown>,
): string {
  if (!level || !entityId) return "";

  const nullable = (expr: string) => `AND (${expr} IS NULL OR ${expr} = '')`;

  switch (level) {
    case "branch":
      params.entityId = entityId;
      return `AND ${exprs.branch} = :entityId`;
    case "service_group":
      if (entityId === UNMAPPED_GROUP_ID) return nullable(exprs.serviceGroup);
      params.entityId = entityId;
      return `AND ${exprs.serviceGroup} = :entityId`;
    case "lead_am":
      if (entityId === UNASSIGNED_LEAD_ID) return nullable(exprs.lead);
      params.entityId = entityId;
      return `AND ${exprs.lead} = :entityId`;
    case "am":
      if (entityId === UNASSIGNED_AM_ID) return nullable(exprs.am);
      params.entityId = entityId;
      return `AND ${exprs.am} = :entityId`;
    case "service":
      params.entityId = entityId;
      return `AND ${exprs.service} = :entityId`;
    case "customer":
      params.entityId = entityId;
      return `AND ${exprs.customer} = :entityId`;
    default:
      return "";
  }
}

/** Tenure buckets (months of subscription) shared by dashboard & detail. */
export const TENURE_BUCKETS: Record<string, { min: number; max: number | null }> = {
  lt_1_year: { min: 0, max: 12 },
  "1_2_years": { min: 12, max: 24 },
  "2_3_years": { min: 24, max: 36 },
  "3_4_years": { min: 36, max: 48 },
  "4_5_years": { min: 48, max: 60 },
  gt_5_year: { min: 60, max: null },
};

/**
 * Tenure filter clause measured at the snapshot month's end.
 * `periodExpr` must yield a billing `MMYY` string column.
 */
export function buildTenureClause(
  tenure: string | null | undefined,
  activatedAtExpr: string,
  periodExpr: string,
  params: Record<string, unknown>,
): string {
  if (!tenure || tenure === "all") return "";
  const bucket = TENURE_BUCKETS[tenure];
  if (!bucket) return "";

  const monthsExpr = `TIMESTAMPDIFF(MONTH, ${activatedAtExpr}, LAST_DAY(STR_TO_DATE(CONCAT('01', ${periodExpr}), '%d%m%y')))`;
  params.tenureMin = bucket.min;
  let clause = `AND ${activatedAtExpr} IS NOT NULL AND ${monthsExpr} >= :tenureMin`;
  if (bucket.max !== null) {
    params.tenureMax = bucket.max;
    clause += ` AND ${monthsExpr} < :tenureMax`;
  }
  return clause;
}

/** True when new services (tenure = 0 months) fall inside the tenure filter. */
export function tenureIncludesNew(tenure: string | null | undefined): boolean {
  if (!tenure || tenure === "all") return true;
  const bucket = TENURE_BUCKETS[tenure];
  return !bucket || bucket.min === 0;
}

/** Sanitizes a year list to unique integers within a sane reporting window. */
export function sanitizeYears(years: number[]): number[] {
  const clean = years
    .map((y) => Math.trunc(Number(y)))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100);
  return Array.from(new Set(clean)).sort();
}

/** `YYYY-MM` ISO periods → quoted billing `'MMYY'` list for SQL `IN (...)`. */
export function isoPeriodsToBillingList(periods: string[]): string {
  return periods
    .filter((p) => /^\d{4}-\d{2}$/.test(p))
    .map((p) => `'${p.slice(5, 7)}${p.slice(2, 4)}'`)
    .join(", ");
}

/** All 12 billing periods (`'MMYY', ...`) for a given year. */
export function yearBillingList(year: number): string {
  const yy = String(year).slice(2);
  return Array.from({ length: 12 }, (_, i) => `'${String(i + 1).padStart(2, "0")}${yy}'`).join(", ");
}
