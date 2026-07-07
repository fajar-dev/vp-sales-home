/**
 * Typed API functions for VP Access Home endpoints.
 * Each function maps to a specific backend route.
 */

import { apiGet } from './client'

// ============================================================
// Response Types — match backend API response shapes
// ============================================================

/** Total Service summary row (operational POV) */
export interface TotalServiceSummaryOperational {
  period: string        // "2025-01"
  branch: string
  service_group: string
  service: string
  total_active: number
  total_churn: number
}

/** Total Service summary row (sales POV) */
export interface TotalServiceSummarySales {
  period: string
  branch: string
  manager_sales_name: string
  sales_name: string
  total_active: number
  total_churn: number
}

export type TotalServiceSummaryRow = TotalServiceSummaryOperational | TotalServiceSummarySales

/** Total Service detail row */
export interface TotalServiceDetailRow {
  service_id: string
  service: string
  customer_name: string
  address: string
  service_group: string
  branch: string
  sales_name: string
  manager_sales_name: string
  status: string
  active_at: string
  churn_date: string | null
  tenure_days: number | null
}

/** New Growth summary row (operational POV) */
export interface NewGrowthSummaryOperational {
  period: string
  branch: string
  service_group: string
  service: string
  total_new: number
  total_homeconnect: number
  total_block: number
  total_homepaid: number
}

/** New Growth summary row (sales POV) */
export interface NewGrowthSummarySales {
  period: string
  branch: string
  manager_sales_name: string
  sales_name: string
  total_new: number
  total_homeconnect: number
  total_block: number
  total_homepaid: number
}

export type NewGrowthSummaryRow = NewGrowthSummaryOperational | NewGrowthSummarySales

/** New Growth detail row */
export interface NewGrowthDetailRow {
  service_id: string
  service: string
  customer_name: string
  address: string
  service_group: string
  branch: string
  sales_name: string
  manager_sales_name: string
  status: string
  activated_at: string
}

/** Revenue summary row */
export interface RevenueSummaryRow {
  period: string
  branch: string
  total: number
}

/** Revenue detail row */
export interface RevenueDetailRow {
  service_id: string
  service: string
  customer_name: string
  address: string
  billing_date: string
  service_group: string
  branch: string
  sales_name: string
  manager_sales_name: string
  inv_desc: string
  receipt_id: string
  total: number
}

/** Billing summary */
export interface BillingSummary {
  total_paid: number
  total_all: number
}

/** Revenue total */
export interface RevenueTotal {
  total: number
}

// ============================================================
// API Functions
// ============================================================

/**
 * Fetches total service summary (active services & churn per period).
 * @param year - Report year
 * @param branchId - Branch filter
 * @param pov - Point of view: "operational" | "sales"
 */
export async function fetchTotalServiceSummary(
  year: number,
  branchId: string,
  pov: string
): Promise<TotalServiceSummaryRow[]> {
  return apiGet<TotalServiceSummaryRow[]>('/vp-access-home/total-service/summary', {
    year: String(year),
    branchId,
    pov,
  })
}

/**
 * Fetches total service detail for a specific period.
 * @param year - Report year
 * @param branchId - Branch filter
 * @param period - Optional period in format MMYY (e.g. "0125"). When omitted, returns all data for the year.
 */
export async function fetchTotalServiceDetail(
  year: number,
  branchId: string,
  period?: string
): Promise<TotalServiceDetailRow[]> {
  const params: Record<string, string> = {
    year: String(year),
    branchId,
  }
  if (period) params.period = period
  return apiGet<TotalServiceDetailRow[]>('/vp-access-home/total-service/detail', params)
}

/**
 * Fetches new growth summary.
 * @param year - Report year
 * @param branchId - Branch filter
 * @param pov - Point of view: "operational" | "sales"
 */
export async function fetchNewGrowthSummary(
  year: number,
  branchId: string,
  pov: string
): Promise<NewGrowthSummaryRow[]> {
  return apiGet<NewGrowthSummaryRow[]>('/vp-access-home/new-growth/summary', {
    year: String(year),
    branchId,
    pov,
  })
}

/**
 * Fetches new growth detail.
 * @param year - Report year
 * @param branchId - Branch filter
 * @param period - Period in format YYYY-MM
 */
export async function fetchNewGrowthDetail(
  year: number,
  branchId: string,
  period?: string
): Promise<NewGrowthDetailRow[]> {
  const params: Record<string, string> = {
    year: String(year),
    branchId,
  }
  if (period) params.period = period
  return apiGet<NewGrowthDetailRow[]>('/vp-access-home/new-growth/detail', params)
}

/**
 * Fetches revenue summary.
 * @param year - Report year
 * @param branchId - Branch filter
 */
export async function fetchRevenueSummary(
  year: number,
  branchId: string
): Promise<RevenueSummaryRow[]> {
  return apiGet<RevenueSummaryRow[]>('/vp-access-home/revenue/summary', {
    year: String(year),
    branchId,
  })
}

/**
 * Fetches homepaid revenue summary.
 * @param year - Report year
 * @param branchId - Branch filter
 */
export async function fetchRevenueHomepaid(
  year: number,
  branchId: string
): Promise<RevenueSummaryRow[]> {
  return apiGet<RevenueSummaryRow[]>('/vp-access-home/revenue/homepaid', {
    year: String(year),
    branchId,
  })
}

/**
 * Fetches revenue detail for a specific period.
 * @param year - Report year
 * @param branchId - Branch filter
 * @param period - Period in format YYYY-MM
 */
export async function fetchRevenueDetail(
  year: number,
  branchId: string,
  period?: string
): Promise<RevenueDetailRow[]> {
  const params: Record<string, string> = {
    year: String(year),
    branchId,
  }
  if (period) params.period = period
  return apiGet<RevenueDetailRow[]>('/vp-access-home/revenue/detail', params)
}

/**
 * Fetches billing summary (total paid vs total all).
 * @param year - Report year
 * @param branchId - Branch filter
 */
export async function fetchBillingSummary(
  year: number,
  branchId: string
): Promise<BillingSummary> {
  return apiGet<BillingSummary>('/vp-access-home/revenue/billing-summary', {
    year: String(year),
    branchId,
  })
}

/**
 * Fetches total revenue (single number).
 * @param year - Report year
 * @param branchId - Branch filter
 */
export async function fetchRevenueTotal(
  year: number,
  branchId: string
): Promise<RevenueTotal> {
  return apiGet<RevenueTotal>('/vp-access-home/revenue/total', {
    year: String(year),
    branchId,
  })
}
