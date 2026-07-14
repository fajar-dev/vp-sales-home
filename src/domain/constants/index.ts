/**
 * Centralized Domain Constants & Enums
 *
 * Core business rules, database lifecycle status codes, hierarchy flow definitions,
 * and standard localization maps.
 */

export const DB_SERVICE_STATUS = {
  ACTIVE: "AC",
  FREE: "FR",
  BLOCKED: "BL",
  NON_ACTIVE: "NA",
} as const;

export type DbServiceStatusCode =
  (typeof DB_SERVICE_STATUS)[keyof typeof DB_SERVICE_STATUS];

export const OPERATIONAL_HIERARCHY_FLOW = [
  "branch",
  "service_group",
  "service",
  "customer",
] as const;

export const SALES_HIERARCHY_FLOW = [
  "branch",
  "lead_am",
  "am",
  "service",
] as const;

export const MONTH_NAMES_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export const MONTH_NAMES_FULL_ID: Record<string, string> = {
  Jan: "Januari",
  Feb: "Februari",
  Mar: "Maret",
  Apr: "April",
  Mei: "Mei",
  Jun: "Juni",
  Jul: "Juli",
  Agu: "Agustus",
  Sep: "September",
  Okt: "Oktober",
  Nov: "November",
  Des: "Desember",
};

export const UNMAPPED_LABEL = "Unmapped";
export const UNASSIGNED_LEAD_LABEL = "Unassigned Lead";
export const UNASSIGNED_AM_LABEL = "Unassigned AM";
