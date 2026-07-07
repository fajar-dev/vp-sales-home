/**
 * Adapter functions that transform flat API response data
 * into the hierarchical/structured formats expected by
 * TrendChart, MatrixTable, DetailTableModal, and TrendMatrixTable components.
 */

import type { TrendChartPoint } from '@/components/trend-chart'
import type { TotalServiceV2MatrixRow, TotalServiceV2MatrixCell } from '@/services/total-service'
import type { NewServiceTrendRow, TrendMetricCell } from '@/services/new-service'
import type { EnrichedDetailRow } from '@/components/detail-table-modal'
import type { TotalServicePovMode, TotalServiceRowLevel, TotalServiceGranularity } from '@/types/entities'
import type {
  TotalServiceSummaryRow,
  NewGrowthSummaryRow,
  RevenueSummaryRow,
  TotalServiceDetailRow,
  NewGrowthDetailRow,
  RevenueDetailRow,
} from './vp-access-home'
import { calculateDeltaPercentage } from '@/services/shared-utils'

// ============================================================
// Time Buckets (supports month / quarter / semester / year)
// ============================================================

const MONTH_SHORT_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

const MONTH_LONG_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export interface MonthBucket {
  key: string    // "2025-01" | "2025-Q1" | "2025-H1" | "2025"
  label: string  // "Jan" | "Q1" | "H1" | "2025"
  periods: string[]
}

/**
 * Builds time buckets for a given year based on the selected granularity.
 * @param year - The year to generate buckets for
 * @param granularity - Granularity level: month, quarter, semester, or year
 * @returns Array of time buckets
 */
export function buildTimeBuckets(year: number, granularity: TotalServiceGranularity = 'month'): MonthBucket[] {
  switch (granularity) {
    case 'month':
      return Array.from({ length: 12 }, (_, i) => ({
        key: `${year}-${String(i + 1).padStart(2, '0')}`,
        label: MONTH_SHORT_LABELS[i],
        periods: [`${year}-${String(i + 1).padStart(2, '0')}`],
      }))
    case 'quarter':
      return [0, 1, 2, 3].map(q => ({
        key: `${year}-Q${q + 1}`,
        label: `Q${q + 1}`,
        periods: [1, 2, 3].map(m => `${year}-${String(q * 3 + m).padStart(2, '0')}`),
      }))
    case 'semester':
      return [0, 1].map(s => ({
        key: `${year}-H${s + 1}`,
        label: `H${s + 1}`,
        periods: Array.from({ length: 6 }, (_, m) => `${year}-${String(s * 6 + m + 1).padStart(2, '0')}`),
      }))
    case 'year':
      return [{
        key: `${year}`,
        label: `${year}`,
        periods: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
      }]
  }
}

/**
 * Backward-compatible alias that builds 12 monthly buckets.
 * @param year - The year to generate buckets for
 * @returns Array of 12 month buckets
 */
export function buildMonthBuckets(year: number): MonthBucket[] {
  return buildTimeBuckets(year, 'month')
}

// ============================================================
// TrendChart Adapters
// ============================================================

/**
 * Transforms flat API data into TrendChart series format.
 * Groups data by period, sums the specified metric, and creates chart points.
 *
 * @param data - Flat API response rows
 * @param metricKey - Which metric to sum (e.g. 'total_active', 'total_new', 'total_churn', 'total')
 * @param year - Current year
 * @param compareData - Optional comparison year data
 * @returns TrendChartPoint array for TrendChart component
 */
export function adaptToChartSeries(
  data: Record<string, unknown>[],
  metricKey: string,
  year: number,
  compareData?: Record<string, unknown>[] | null,
  granularity: TotalServiceGranularity = 'month'
): TrendChartPoint[] {
  const buckets = buildTimeBuckets(year, granularity)
  const periodSums = groupAndSum(data, metricKey)
  const comparePeriodSums = compareData ? groupAndSum(compareData, metricKey) : null

  return buckets.map((bucket) => {
    // Sum ALL periods that belong to this bucket
    const value = bucket.periods.reduce((sum, p) => sum + (periodSums.get(p) ?? 0), 0)

    let compareValue: number | undefined = undefined
    if (comparePeriodSums) {
      // Find matching periods in compare data (same month pattern, different year)
      compareValue = bucket.periods.reduce((sum, p) => {
        const month = p.split('-')[1]
        let monthValue = 0
        for (const [period, val] of comparePeriodSums.entries()) {
          if (period.endsWith(`-${month}`)) {
            monthValue = val
            break
          }
        }
        return sum + monthValue
      }, 0)
    }

    return {
      bucketKey: bucket.key,
      label: bucket.label,
      value,
      compareValue,
    }
  })
}

/**
 * Computes the initial previous value (Dec of previous year).
 * @param data - API response rows (should include Dec of prev year if available)
 * @param metricKey - Metric to sum
 * @param year - Current year
 * @returns Sum for December of previous year, or null
 */
export function computeInitialPreviousValue(
  data: Record<string, unknown>[],
  metricKey: string,
  year: number
): number | null {
  const prevDecPeriod = `${year - 1}-12`
  const decData = data.filter((row) => (row as Record<string, string>).period === prevDecPeriod)
  if (decData.length === 0) return null
  return decData.reduce((sum, row) => sum + (Number((row as Record<string, unknown>)[metricKey]) || 0), 0)
}

// ============================================================
// MatrixTable Adapters
// ============================================================

/**
 * Transforms flat API data into hierarchical MatrixTable rows.
 * Groups data based on POV (operational: branch → service_group → service, 
 * sales: branch → manager_sales_name → sales_name).
 *
 * @param data - Flat API response rows
 * @param metricKey - Which metric to use for cell values
 * @param pov - Point of view mode
 * @param year - Current year
 * @param compareData - Optional comparison data for delta calculations
 * @returns Hierarchical rows compatible with MatrixTable component
 */
export function adaptToMatrixRows(
  data: Record<string, unknown>[],
  metricKey: string,
  pov: TotalServicePovMode,
  year: number,
  compareData?: Record<string, unknown>[] | null,
  granularity: TotalServiceGranularity = 'month'
): TotalServiceV2MatrixRow[] {
  const buckets = buildTimeBuckets(year, granularity)

  // Define hierarchy levels based on POV
  const levels: { field: string; level: TotalServiceRowLevel }[] =
    pov === 'operational'
      ? [
          { field: 'branch', level: 'branch' },
          { field: 'service_group', level: 'service_group' },
          { field: 'service', level: 'service' },
        ]
      : [
          { field: 'branch', level: 'branch' },
          { field: 'manager_sales_name', level: 'lead_am' },
          { field: 'sales_name', level: 'am' },
        ]

  return buildHierarchicalRows(data, metricKey, levels, 0, buckets, null, compareData ?? null)
}

/**
 * Recursively builds hierarchical rows for the matrix table.
 * Uses compound IDs that encode the full hierarchy path
 * (e.g., "Medan" → "Medan::Broadband Business" → "Medan::Broadband Business::Internet").
 */
function buildHierarchicalRows(
  data: Record<string, unknown>[],
  metricKey: string,
  levels: { field: string; level: TotalServiceRowLevel }[],
  levelIndex: number,
  buckets: MonthBucket[],
  parentPath: string | null,
  compareData: Record<string, unknown>[] | null
): TotalServiceV2MatrixRow[] {
  if (levelIndex >= levels.length || data.length === 0) return []

  const { field, level } = levels[levelIndex]
  const grouped = groupBy(data, field)
  const compareGrouped = compareData ? groupBy(compareData, field) : null

  return Array.from(grouped.entries())
    .map(([groupKey, groupRows]) => {
      const compareGroupRows = compareGrouped?.get(groupKey) ?? null

      // Build compound path: "Medan" → "Medan::Broadband Business" → "Medan::Broadband Business::Internet"
      const currentPath = parentPath ? `${parentPath}::${groupKey}` : groupKey

      const cells = buildMatrixCells(groupRows, metricKey, buckets, compareGroupRows)
      const latestValue = cells.at(-1)?.value ?? 0
      const totalAcrossBuckets = cells.reduce((sum, c) => sum + c.value, 0)

      const children = levelIndex + 1 < levels.length
        ? buildHierarchicalRows(
            groupRows,
            metricKey,
            levels,
            levelIndex + 1,
            buckets,
            currentPath,
            compareGroupRows
          )
        : undefined

      return {
        id: currentPath,
        label: groupKey || 'Unmapped',
        level,
        parentId: parentPath,
        latestValue,
        totalAcrossBuckets,
        cells,
        children: children && children.length > 0 ? children : undefined,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Builds matrix cells for each month bucket.
 * Computes value, delta, and percentage for each period.
 */
function buildMatrixCells(
  rows: Record<string, unknown>[],
  metricKey: string,
  buckets: MonthBucket[],
  compareRows: Record<string, unknown>[] | null
): TotalServiceV2MatrixCell[] {
  const periodSums = groupAndSum(rows, metricKey)
  const comparePeriodSums = compareRows ? groupAndSum(compareRows, metricKey) : null

  let previousValue: number | null = null

  return buckets.map((bucket) => {
    // Sum ALL periods that belong to this bucket
    const value = bucket.periods.reduce((sum, p) => sum + (periodSums.get(p) ?? 0), 0)

    let compValue: number | null = null
    if (comparePeriodSums) {
      // Find matching periods in comparison data (same month pattern, different year)
      compValue = bucket.periods.reduce((sum, p) => {
        const month = p.split('-')[1]
        let v = 0
        for (const [period, val] of comparePeriodSums.entries()) {
          if (period.endsWith(`-${month}`)) { v = val; break }
        }
        return sum + v
      }, 0)
    } else {
      compValue = previousValue
    }

    const deltaValue = compValue !== null ? value - compValue : null
    const deltaPercentage = compValue !== null ? calculateDeltaPercentage(value, compValue) : null

    const cell: TotalServiceV2MatrixCell = {
      bucketKey: bucket.key,
      bucketLabel: bucket.label,
      value,
      absoluteValue: Math.abs(value),
      previousValue: compValue,
      deltaValue,
      deltaPercentage,
      trendDirection: deltaValue === null ? 'flat' : deltaValue > 0 ? 'up' : deltaValue < 0 ? 'down' : 'flat',
      isNegative: value < 0,
      isMutedZero: value === 0,
      isInProgress: false,
    }

    previousValue = value
    return cell
  })
}

// ============================================================
// Revenue MatrixTable Adapters (branch-only, no hierarchy)
// ============================================================

/**
 * Builds revenue matrix rows (single level: branch).
 * Revenue API only returns branch-level data.
 *
 * @param data - Revenue summary rows
 * @param year - Current year
 * @param compareData - Optional comparison year data
 * @returns MatrixTable rows
 */
export function adaptRevenueToMatrixRows(
  data: RevenueSummaryRow[],
  year: number,
  compareData?: RevenueSummaryRow[] | null,
  granularity: TotalServiceGranularity = 'month'
): TotalServiceV2MatrixRow[] {
  const buckets = buildTimeBuckets(year, granularity)
  const grouped = groupBy(data as unknown as Record<string, unknown>[], 'branch')
  const compareGrouped = compareData ? groupBy(compareData as unknown as Record<string, unknown>[], 'branch') : null

  return Array.from(grouped.entries())
    .map(([branchKey, branchRows]) => {
      const compareBranchRows = compareGrouped?.get(branchKey) ?? null
      const cells = buildMatrixCells(branchRows, 'total', buckets, compareBranchRows)
      const latestValue = cells.at(-1)?.value ?? 0
      const totalAcrossBuckets = cells.reduce((sum, c) => sum + c.value, 0)

      return {
        id: branchKey,
        label: branchKey || 'Unmapped',
        level: 'branch' as TotalServiceRowLevel,
        parentId: null,
        latestValue,
        totalAcrossBuckets,
        cells,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ============================================================
// DetailTableModal Adapters
// ============================================================

/**
 * Formats tenure days into human-readable Indonesian text.
 * @param days - Number of days
 * @returns Formatted string like "1 tahun 3 bulan" or "45 hari"
 */
function formatTenure(days: number): string {
  if (days < 0) return '—'
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const remainingDays = days % 30

  const parts: string[] = []
  if (years > 0) parts.push(`${years} tahun`)
  if (months > 0) parts.push(`${months} bulan`)
  if (parts.length === 0 || remainingDays > 0) parts.push(`${remainingDays} hari`)
  return parts.join(' ')
}

/**
 * Adapts Total Service detail API rows to EnrichedDetailRow format.
 * @param data - API detail response
 * @returns Rows compatible with DetailTableModal
 */
export function adaptTotalServiceDetailToModalRows(data: TotalServiceDetailRow[]): EnrichedDetailRow[] {
  return data.map((row) => ({
    serviceId: row.service_id,
    customerName: row.customer_name,
    serviceName: row.service,
    branchName: row.branch,
    leadName: row.manager_sales_name || null,
    amName: row.sales_name || null,
    serviceGroup: row.service_group,
    installationAddress: row.address,
    generatedAt: '',
    currentStatus: row.status,
    currentTotalActive: 0,
    bandwidthMbps: null,
    activeDate: row.active_at,
    churnDate: row.churn_date || undefined,
    tenureText: row.tenure_days !== null
      ? formatTenure(row.tenure_days)
      : undefined,
  }))
}

/**
 * Adapts New Growth detail API rows to EnrichedDetailRow format.
 * @param data - API detail response
 * @returns Rows compatible with DetailTableModal
 */
export function adaptNewGrowthDetailToModalRows(data: NewGrowthDetailRow[]): EnrichedDetailRow[] {
  return data.map((row) => ({
    serviceId: row.service_id,
    customerName: row.customer_name,
    serviceName: row.service,
    branchName: row.branch,
    leadName: row.manager_sales_name || null,
    amName: row.sales_name || null,
    serviceGroup: row.service_group,
    installationAddress: row.address,
    generatedAt: '',
    currentStatus: row.status,
    currentTotalActive: 0,
    bandwidthMbps: null,
    activeDate: row.activated_at,
  }))
}

/**
 * Adapts Revenue detail API rows to EnrichedDetailRow format.
 * @param data - API detail response
 * @returns Rows compatible with DetailTableModal
 */
export function adaptRevenueDetailToModalRows(data: RevenueDetailRow[]): EnrichedDetailRow[] {
  return data.map((row) => ({
    serviceId: row.service_id,
    customerName: row.customer_name,
    serviceName: row.service,
    branchName: row.branch,
    leadName: row.manager_sales_name || null,
    amName: row.sales_name || null,
    serviceGroup: row.service_group,
    installationAddress: row.address,
    generatedAt: '',
    currentStatus: '',
    currentTotalActive: 0,
    bandwidthMbps: null,
    expectedRevenue: row.total,
    period: row.billing_date,
    invoiceNumber: row.inv_desc || null,
    receiptNumber: row.receipt_id || null,
  }))
}

// ============================================================
// TrendMatrixTable Adapters (for New Service trend view)
// ============================================================

/**
 * Adapts new growth summary data to TrendMatrixTable rows.
 * Groups by period (month), then by branch hierarchy.
 *
 * @param data - New growth summary API response
 * @param pov - Point of view mode
 * @param year - Current year
 * @returns NewServiceTrendRow[] for TrendMatrixTable
 */
export function adaptToTrendMatrixRows(
  data: NewGrowthSummaryRow[],
  pov: TotalServicePovMode,
  year: number,
  granularity: TotalServiceGranularity = 'month'
): NewServiceTrendRow[] {
  const buckets = buildTimeBuckets(year, granularity)

  // Group all rows by period
  const byPeriod = new Map<string, Record<string, unknown>[]>()
  for (const row of data) {
    const existing = byPeriod.get(row.period) ?? []
    existing.push(row as unknown as Record<string, unknown>)
    byPeriod.set(row.period, existing)
  }

  let previousTotal = 0
  let previousHomeconnect = 0
  let previousBlock = 0
  let previousHomepaid = 0

  return buckets.map((bucket, bucketIdx) => {
    // Collect rows from ALL periods within this bucket
    const periodRows = bucket.periods.flatMap(p => byPeriod.get(p) ?? [])
    const totalNew = periodRows.reduce((sum, r) => sum + (Number(r.total_new) || 0), 0)
    const totalHomeconnect = periodRows.reduce((sum, r) => sum + (Number(r.total_homeconnect) || 0), 0)
    const totalBlock = periodRows.reduce((sum, r) => sum + (Number(r.total_block) || 0), 0)
    const totalHomepaid = periodRows.reduce((sum, r) => sum + (Number(r.total_homepaid) || 0), 0)

    const delta = bucketIdx === 0 ? null : totalNew - previousTotal
    const deltaPercentage = delta !== null && previousTotal > 0
      ? Math.round((delta / previousTotal) * 100)
      : null

    const totalNewCell: TrendMetricCell = {
      value: totalNew,
      delta,
      deltaPercentage,
    }

    // Compute deltas for sub-metrics
    const homepaidDelta = bucketIdx === 0 ? null : totalHomepaid - previousHomepaid
    const homepaidDeltaPct = homepaidDelta !== null && previousHomepaid > 0
      ? Math.round((homepaidDelta / previousHomepaid) * 100)
      : null

    const homeconnectDelta = bucketIdx === 0 ? null : totalHomeconnect - previousHomeconnect
    const homeconnectDeltaPct = homeconnectDelta !== null && previousHomeconnect > 0
      ? Math.round((homeconnectDelta / previousHomeconnect) * 100)
      : null

    const blockDelta = bucketIdx === 0 ? null : totalBlock - previousBlock
    const blockDeltaPct = blockDelta !== null && previousBlock > 0
      ? Math.round((blockDelta / previousBlock) * 100)
      : null

    // Build child rows by branch hierarchy — collect previous bucket's rows
    const prevBucketRows = bucketIdx > 0
      ? buckets[bucketIdx - 1].periods.flatMap(p => byPeriod.get(p) ?? [])
      : undefined
    const children = buildTrendChildRowsFromApi(periodRows, pov, bucket.key, previousTotal > 0 ? prevBucketRows : undefined)

    previousTotal = totalNew
    previousHomeconnect = totalHomeconnect
    previousBlock = totalBlock
    previousHomepaid = totalHomepaid

    return {
      id: bucket.key,
      label: bucket.label,
      level: 'period' as const,
      parentId: null,
      totalNewService: totalNewCell,
      homepaid: { value: totalHomepaid, delta: homepaidDelta, deltaPercentage: homepaidDeltaPct },
      homeconnect: { value: totalHomeconnect, delta: homeconnectDelta, deltaPercentage: homeconnectDeltaPct },
      block: { value: totalBlock, delta: blockDelta, deltaPercentage: blockDeltaPct },
      connectionRate: totalNew > 0 ? Math.round((totalHomeconnect / totalNew) * 100) : 0,
      paymentRate: totalNew > 0 ? Math.round((totalHomepaid / totalNew) * 100) : 0,
      children,
    }
  })
}

/**
 * Builds trend child rows grouped by branch hierarchy.
 */
function buildTrendChildRowsFromApi(
  rows: Record<string, unknown>[],
  pov: TotalServicePovMode,
  periodKey: string,
  previousPeriodRows?: Record<string, unknown>[]
): NewServiceTrendRow[] {
  const field = 'branch'
  const level: TotalServiceRowLevel = 'branch'
  const grouped = groupBy(rows, field)

  const prevGrouped = previousPeriodRows ? groupBy(previousPeriodRows, field) : null

  return Array.from(grouped.entries())
    .map(([groupKey, groupRows]) => {
      const totalNew = groupRows.reduce((sum, r) => sum + (Number(r.total_new) || 0), 0)
      const totalHomeconnect = groupRows.reduce((sum, r) => sum + (Number(r.total_homeconnect) || 0), 0)
      const totalBlock = groupRows.reduce((sum, r) => sum + (Number(r.total_block) || 0), 0)
      const totalHomepaid = groupRows.reduce((sum, r) => sum + (Number(r.total_homepaid) || 0), 0)

      const prevRows = prevGrouped?.get(groupKey)
      const prevTotal = prevRows ? prevRows.reduce((sum, r) => sum + (Number(r.total_new) || 0), 0) : 0
      const prevHomeconnect = prevRows ? prevRows.reduce((sum, r) => sum + (Number(r.total_homeconnect) || 0), 0) : 0
      const prevBlock = prevRows ? prevRows.reduce((sum, r) => sum + (Number(r.total_block) || 0), 0) : 0
      const prevHomepaid = prevRows ? prevRows.reduce((sum, r) => sum + (Number(r.total_homepaid) || 0), 0) : 0

      const delta = prevGrouped ? totalNew - prevTotal : null
      const deltaPercentage = delta !== null && prevTotal > 0
        ? Math.round((delta / prevTotal) * 100)
        : null

      const homepaidDelta = prevGrouped ? totalHomepaid - prevHomepaid : null
      const homepaidDeltaPct = homepaidDelta !== null && prevHomepaid > 0
        ? Math.round((homepaidDelta / prevHomepaid) * 100)
        : null

      const homeconnectDelta = prevGrouped ? totalHomeconnect - prevHomeconnect : null
      const homeconnectDeltaPct = homeconnectDelta !== null && prevHomeconnect > 0
        ? Math.round((homeconnectDelta / prevHomeconnect) * 100)
        : null

      const blockDelta = prevGrouped ? totalBlock - prevBlock : null
      const blockDeltaPct = blockDelta !== null && prevBlock > 0
        ? Math.round((blockDelta / prevBlock) * 100)
        : null

      return {
        id: `${periodKey}::${groupKey}`,
        label: groupKey || 'Unmapped',
        level,
        parentId: null,
        totalNewService: { value: totalNew, delta, deltaPercentage },
        homepaid: { value: totalHomepaid, delta: homepaidDelta, deltaPercentage: homepaidDeltaPct },
        homeconnect: { value: totalHomeconnect, delta: homeconnectDelta, deltaPercentage: homeconnectDeltaPct },
        block: { value: totalBlock, delta: blockDelta, deltaPercentage: blockDeltaPct },
        connectionRate: totalNew > 0 ? Math.round((totalHomeconnect / totalNew) * 100) : 0,
        paymentRate: totalNew > 0 ? Math.round((totalHomepaid / totalNew) * 100) : 0,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ============================================================
// Revenue-specific chart adapter
// ============================================================

/**
 * Builds chart series specifically for revenue data.
 * @param data - Revenue summary rows
 * @param year - Current year
 * @param compareData - Optional comparison year data
 * @returns TrendChartPoint array
 */
export function adaptRevenueToChartSeries(
  data: RevenueSummaryRow[],
  year: number,
  compareData?: RevenueSummaryRow[] | null,
  granularity: TotalServiceGranularity = 'month'
): TrendChartPoint[] {
  const buckets = buildTimeBuckets(year, granularity)
  const periodSums = groupAndSum(data as unknown as Record<string, unknown>[], 'total')
  const comparePeriodSums = compareData
    ? groupAndSum(compareData as unknown as Record<string, unknown>[], 'total')
    : null

  return buckets.map((bucket) => {
    // Sum ALL periods that belong to this bucket
    const value = bucket.periods.reduce((sum, p) => sum + (periodSums.get(p) ?? 0), 0)
    let compareValue: number | undefined = undefined

    if (comparePeriodSums) {
      compareValue = bucket.periods.reduce((sum, p) => {
        const month = p.split('-')[1]
        let monthValue = 0
        for (const [period, val] of comparePeriodSums.entries()) {
          if (period.endsWith(`-${month}`)) {
            monthValue = val
            break
          }
        }
        return sum + monthValue
      }, 0)
    }

    return {
      bucketKey: bucket.key,
      label: bucket.label,
      value,
      compareValue,
    }
  })
}

// ============================================================
// Detail Entity Filtering
// ============================================================

/**
 * Filters detail rows based on the entity hierarchy that was clicked.
 * The entityId is a compound path like "Medan::Broadband Business::Internet"
 * which encodes the full hierarchy: branch → service_group → service (operational)
 * or branch → manager_sales → sales (sales).
 *
 * @param rows - Detail rows to filter
 * @param entityId - Compound entity ID (e.g., "Medan::Broadband Business")
 * @param pov - Point of view: 'operational' or 'sales'
 * @returns Filtered rows
 */
export function filterDetailByEntity(
  rows: EnrichedDetailRow[],
  entityId: string | null,
  pov: TotalServicePovMode
): EnrichedDetailRow[] {
  if (!entityId) return rows

  const parts = entityId.split('::')

  if (pov === 'operational') {
    return rows.filter((r) => {
      if (parts[0] && (r.branchName ?? '') !== parts[0]) return false
      if (parts.length > 1 && parts[1] && (r.serviceGroup ?? '') !== parts[1]) return false
      if (parts.length > 2 && parts[2] && (r.serviceName ?? '') !== parts[2]) return false
      return true
    })
  } else {
    return rows.filter((r) => {
      if (parts[0] && (r.branchName ?? '') !== parts[0]) return false
      if (parts.length > 1 && parts[1] && (r.leadName ?? '') !== parts[1]) return false
      if (parts.length > 2 && parts[2] && (r.amName ?? '') !== parts[2]) return false
      return true
    })
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Groups data rows by a field value.
 */
function groupBy(
  data: Record<string, unknown>[],
  field: string
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>()
  for (const row of data) {
    const key = String(row[field] ?? 'Unknown')
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }
  return map
}

/**
 * Groups data by period and sums the metric value.
 */
function groupAndSum(
  data: Record<string, unknown>[],
  metricKey: string
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of data) {
    const period = String(row.period ?? '')
    const value = Number(row[metricKey]) || 0
    map.set(period, (map.get(period) ?? 0) + value)
  }
  return map
}
