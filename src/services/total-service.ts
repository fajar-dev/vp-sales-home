import type {
  OrganizationNode,
  ServiceMonthlySnapshot,
  TotalServiceDashboardState,
  TotalServiceDrilldownNode,
  TotalServiceGranularity,
  TotalServiceMetricMode,
  TotalServicePovMode,
  TotalServiceRowLevel,
  UserAccessScope,
} from "@/types/entities"
import {
  calculateDeltaPercentage,
  getChangeDirection,
  normalizeServiceGroup,
  parseMonthlyPeriod,
  buildMonthPeriod,
  getYearFromPeriod,
  buildNodeMap,
  isNodeVisibleToUser,
  applyRoleScope,
} from "./shared-utils"
import type { TotalServiceChangeDirection } from "./shared-utils"

export type TotalServiceComparisonMode =
  | "previous_period"
  | "previous_year"
  | "custom"



export type TotalServiceWarningSeverity = "info" | "warning" | "error"

export interface TotalServiceWarning {
  code: string
  severity: TotalServiceWarningSeverity
  message: string
  snapshotId?: string
}

export interface TotalServiceV2TimeBucket {
  key: string
  label: string
  startPeriod: string
  endPeriod: string
  periods: string[]
  monthNumbers: number[]
  hasData: boolean
  isInProgress: boolean
}

export interface TotalServiceV2MatrixCell {
  bucketKey: string
  bucketLabel: string
  value: number
  absoluteValue: number
  previousValue: number | null
  deltaValue: number | null
  deltaPercentage: number | null
  trendDirection: TotalServiceChangeDirection
  isNegative: boolean
  isMutedZero: boolean
  isInProgress: boolean
  /** False when the bucket has no snapshot data yet (future/not-run months). */
  hasData: boolean
}

export interface TotalServiceV2MatrixRow {
  id: string
  label: string
  level: TotalServiceRowLevel
  parentId: string | null
  latestValue: number
  totalAcrossBuckets: number
  cells: TotalServiceV2MatrixCell[]
  children?: TotalServiceV2MatrixRow[]
}

export interface TotalServiceV2ChartPoint {
  bucketKey: string
  label: string
  value: number
  absoluteValue: number
  isNegative: boolean
  isInProgress: boolean
  compareValue?: number
}

export interface TotalServiceV2Summary {
  headlineValue: number
  totalAcrossBuckets: number
  latestBucketKey: string | null
  latestBucketLabel: string | null
  deltaFromPreviousBucket: number | null
  deltaPercentageFromPreviousBucket: number | null
  metricMode: TotalServiceMetricMode
  granularity: TotalServiceGranularity
  povMode: TotalServicePovMode
  lastUpdatedAt: string | null
  initialPreviousValue: number | null
}

export interface TotalServiceV2DashboardData {
  summary: TotalServiceV2Summary
  buckets: TotalServiceV2TimeBucket[]
  rows: TotalServiceV2MatrixRow[]
  chartSeries: TotalServiceV2ChartPoint[]
  warnings: TotalServiceWarning[]
  currentRowLevel: TotalServiceRowLevel
  contextualDetailTarget: TotalServiceDrilldownNode | null
  initialPreviousValue: number | null
  isEmpty: boolean
}

function getActiveCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.activeServiceCount > 0) return snapshot.activeServiceCount
  return snapshot.isActiveEndOfPeriod ? 1 : 0
}

function getChurnCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.churnServiceCount > 0) return snapshot.churnServiceCount
  return snapshot.isChurnedInPeriod ? 1 : 0
}

function getLatestGeneratedAt(
  snapshots: ServiceMonthlySnapshot[],
): string | null {
  if (snapshots.length === 0) return null

  return snapshots.reduce((latest, current) => {
    if (!latest) return current.generatedAt
    return current.generatedAt > latest ? current.generatedAt : latest
  }, null as string | null)
}

/**
 * Data-integrity checks over the aggregated rows. Issues are summarized per
 * code (with an affected-row count) so a widespread mapping problem shows up
 * as one warning, not thousands.
 */
export function collectTotalServiceWarnings(
  snapshots: ServiceMonthlySnapshot[],
): TotalServiceWarning[] {
  let missingBranch = 0
  let unmappedGroup = 0
  let partialData = 0

  for (const snapshot of snapshots) {
    if (!snapshot.branchId || snapshot.branchId === "unmapped-branch") missingBranch += 1
    if (!snapshot.serviceGroup?.trim() || snapshot.serviceGroup === "Unmapped") unmappedGroup += 1
    if (snapshot.dataCompletenessStatus !== "complete") partialData += 1
  }

  const warnings: TotalServiceWarning[] = []
  if (missingBranch > 0) {
    warnings.push({
      code: "MISSING_BRANCH",
      severity: "error",
      message: `${missingBranch} baris data tidak memiliki pemetaan cabang.`,
    })
  }
  if (unmappedGroup > 0) {
    warnings.push({
      code: "UNMAPPED_SERVICE_GROUP",
      severity: "warning",
      message: `${unmappedGroup} baris data tanpa grup layanan — ditampilkan sebagai "Unmapped".`,
    })
  }
  if (partialData > 0) {
    warnings.push({
      code: "PARTIAL_DATA",
      severity: "warning",
      message: `${partialData} baris data berstatus tidak lengkap.`,
    })
  }
  return warnings
}

import {
  buildTimeBuckets as domainBuildTimeBuckets,
  getPreviousBucket as domainGetPreviousBucket,
  diffInMonths,
} from "@/domain/calculators/time-bucket.calculator"

export { diffInMonths }

export function buildTotalServiceV2TimeBuckets(
  granularity: TotalServiceGranularity,
  year: number,
  snapshots: ServiceMonthlySnapshot[],
): TotalServiceV2TimeBucket[] {
  return domainBuildTimeBuckets(granularity, year, snapshots)
}

export function getPreviousBucket(
  granularity: TotalServiceGranularity,
  year: number,
): TotalServiceV2TimeBucket {
  return domainGetPreviousBucket(granularity, year)
}


// ==========================================================
// [TOTAL-SERVICE-V2:POV-FILTERS]
// ==========================================================

export function getTotalServiceV2RootLevel(): TotalServiceRowLevel {
  return "branch"
}

export function getTotalServiceV2CurrentLevel(
  state: TotalServiceDashboardState,
): TotalServiceRowLevel {
  // Customer level is served by the detail modal (click a row/cell), not the
  // matrix tree — aggregated rows do not carry per-customer data.
  const operationalLevels: TotalServiceRowLevel[] = [
    "branch",
    "service_group",
    "service",
  ]

  const salesLevels: TotalServiceRowLevel[] = [
    "branch",
    "lead_am",
    "am",
    "service",
  ]

  const levels = state.povMode === "operational" ? operationalLevels : salesLevels
  return levels[Math.min(state.drilldownPath.length, levels.length - 1)]
}

export function getNextRowLevel(
  povMode: TotalServicePovMode,
  currentLevel: TotalServiceRowLevel,
): TotalServiceRowLevel | null {
  const operationalFlow: TotalServiceRowLevel[] = [
    "branch",
    "service_group",
    "service",
  ]
  const salesFlow: TotalServiceRowLevel[] = ["branch", "lead_am", "am", "service"]

  const flow = povMode === "operational" ? operationalFlow : salesFlow
  const index = flow.indexOf(currentLevel)

  if (index === -1 || index === flow.length - 1) return null
  return flow[index + 1]
}

function applyTotalServiceV2RelevantFilters(
  snapshots: ServiceMonthlySnapshot[],
  state: TotalServiceDashboardState,
): ServiceMonthlySnapshot[] {
  return snapshots.filter((snapshot) => {
    const periodYear = getYearFromPeriod(snapshot.period)
    if (
      periodYear !== state.year &&
      periodYear !== state.year - 1 &&
      (state.compareYear === null || periodYear !== state.compareYear)
    ) {
      return false
    }

    if (state.filters.branchId && snapshot.branchId !== state.filters.branchId) {
      return false
    }

    if (state.povMode === "sales") {
      if (state.filters.leadId && snapshot.leadId !== state.filters.leadId) return false
      if (state.filters.amId && snapshot.amId !== state.filters.amId) return false
    }

    if (state.povMode === "operational") {
      if (
        state.filters.serviceGroup &&
        normalizeServiceGroup(snapshot.serviceGroup) !== state.filters.serviceGroup
      ) {
        return false
      }
    }

    if (!state.filters.includePartialData && snapshot.dataCompletenessStatus !== "complete") {
      return false
    }

    return true
  })
}

function applyTotalServiceV2DrilldownPath(
  snapshots: ServiceMonthlySnapshot[],
  state: TotalServiceDashboardState,
): ServiceMonthlySnapshot[] {
  return state.drilldownPath.reduce((current, node) => {
    return current.filter((snapshot) => {
      if (node.level === "branch") return snapshot.branchId === node.id
      if (node.level === "service_group") {
        return normalizeServiceGroup(snapshot.serviceGroup) === node.id
      }
      if (node.level === "lead_am") {
        return (snapshot.leadId ?? "unassigned-lead") === node.id
      }
      if (node.level === "am") {
        return (snapshot.amId ?? "unassigned-am") === node.id
      }
      if (node.level === "service") return snapshot.productServiceId === node.id
      if (node.level === "customer") return snapshot.custId === node.id
      return true
    })
  }, snapshots)
}

function collectTotalServiceV2StateWarnings(
  state: TotalServiceDashboardState,
  access: UserAccessScope,
  nodes: OrganizationNode[],
): TotalServiceWarning[] {
  const nodeMap = buildNodeMap(nodes)
  const warnings: TotalServiceWarning[] = []

  if (state.filters.branchId && !isNodeVisibleToUser(state.filters.branchId, access, nodeMap)) {
    warnings.push({
      code: "INVALID_BRANCH_SCOPE",
      severity: "error",
      message: "Branch yang dipilih berada di luar scope akses user.",
    })
  }

  if (state.filters.leadId && !isNodeVisibleToUser(state.filters.leadId, access, nodeMap)) {
    warnings.push({
      code: "INVALID_LEAD_SCOPE",
      severity: "error",
      message: "Lead AM yang dipilih berada di luar scope akses user.",
    })
  }

  if (state.filters.amId && !isNodeVisibleToUser(state.filters.amId, access, nodeMap)) {
    warnings.push({
      code: "INVALID_AM_SCOPE",
      severity: "error",
      message: "AM yang dipilih berada di luar scope akses user.",
    })
  }

  if (state.povMode === "operational" && (state.filters.leadId || state.filters.amId)) {
    warnings.push({
      code: "IGNORED_SALES_FILTERS",
      severity: "info",
      message: "Lead AM / AM filter diabaikan pada Operational View.",
    })
  }

  if (state.povMode === "sales" && state.filters.serviceGroup) {
    warnings.push({
      code: "IGNORED_OPERATIONAL_FILTER",
      severity: "info",
      message: "Service Group filter diabaikan pada Sales View.",
    })
  }

  return warnings
}

// ==========================================================
// [TOTAL-SERVICE-V2:AGGREGATION]
// ==========================================================

function getNewServiceCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.newServiceCount > 0) return snapshot.newServiceCount
  return snapshot.isRegisteredInPeriod ? 1 : 0
}

/**
 * `new_service` / `churn` are flow metrics (events per month) → summed across a
 * bucket's months. `total_service` / `accumulation` are stock metrics (a
 * point-in-time count of active services) → they must NOT be summed across
 * months (that would count a service once per month it stayed active). Instead
 * we take the end-of-period value: the active count at the latest month in the
 * bucket that has data.
 */
function isFlowMetric(metricMode: TotalServiceMetricMode): boolean {
  return metricMode === "new_service" || metricMode === "churn"
}

/**
 * Active-service count at the most recent month that actually carries active
 * data. A month with new activations but no end-of-month excerpt yet (e.g. the
 * current in-progress month) produces snapshot rows with activeServiceCount=0;
 * those must not be treated as the "latest period" or the stock total collapses
 * to zero. So we pick the latest period among rows with a positive active count.
 */
function getStockValueAtLatestPeriod(snapshots: ServiceMonthlySnapshot[]): number {
  const withActive = snapshots.filter((snapshot) => getActiveCount(snapshot) > 0)
  if (withActive.length === 0) return 0
  const latestPeriod = withActive.reduce(
    (max, snapshot) => (snapshot.period > max ? snapshot.period : max),
    withActive[0].period,
  )
  return withActive
    .filter((snapshot) => snapshot.period === latestPeriod)
    .reduce((total, snapshot) => total + getActiveCount(snapshot), 0)
}

function getMetricValueForBucket(
  snapshots: ServiceMonthlySnapshot[],
  bucket: TotalServiceV2TimeBucket,
  metricMode: TotalServiceMetricMode,
): number {
  const bucketSnapshots = snapshots.filter((snapshot) =>
    bucket.periods.includes(snapshot.period),
  )

  if (metricMode === "new_service") {
    return bucketSnapshots.reduce((total, snapshot) => total + getNewServiceCount(snapshot), 0)
  }

  if (metricMode === "churn") {
    return bucketSnapshots.reduce((total, snapshot) => total + getChurnCount(snapshot), 0)
  }

  // Stock metric: end-of-period active count (latest month with data in bucket).
  return getStockValueAtLatestPeriod(bucketSnapshots)
}

function buildTotalServiceV2Cells(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  metricMode: TotalServiceMetricMode,
  granularity: TotalServiceGranularity,
  year: number,
  compareYear: number | null = null,
): TotalServiceV2MatrixCell[] {
  const getComparisonValue = (bucket: TotalServiceV2TimeBucket): number | null => {
    if (compareYear === null) return null
    const comparisonPeriods = bucket.periods.map((period) => {
      const parsed = parseMonthlyPeriod(period)
      if (!parsed) return period
      return buildMonthPeriod(compareYear, parsed.month)
    })
    const comparisonBucket: TotalServiceV2TimeBucket = {
      ...bucket,
      periods: comparisonPeriods,
      startPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[0]),
      endPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[bucket.monthNumbers.length - 1]),
    }
    const hasData = snapshots.some((s) => comparisonPeriods.includes(s.period))
    return hasData ? getMetricValueForBucket(snapshots, comparisonBucket, metricMode) : null
  }

  const prevBucket = getPreviousBucket(granularity, year)
  let previousValue = getMetricValueForBucket(snapshots, prevBucket, metricMode)

  return buckets.map((bucket) => {
    // Months with no snapshot data yet (future / not-run) must not be reported
    // as a real 0 — that produces a bogus -100% delta. Emit an empty cell.
    if (!bucket.hasData) {
      return {
        bucketKey: bucket.key,
        bucketLabel: bucket.label,
        value: 0,
        absoluteValue: 0,
        previousValue: null,
        deltaValue: null,
        deltaPercentage: null,
        trendDirection: getChangeDirection(0),
        isNegative: false,
        isMutedZero: true,
        isInProgress: bucket.isInProgress,
        hasData: false,
      } satisfies TotalServiceV2MatrixCell
    }

    const value = getMetricValueForBucket(snapshots, bucket, metricMode)
    const compValue = compareYear !== null ? getComparisonValue(bucket) : previousValue
    const deltaValue = compValue === null ? null : value - compValue
    const deltaPercentage =
      compValue === null ? null : calculateDeltaPercentage(value, compValue)

    const cell: TotalServiceV2MatrixCell = {
      bucketKey: bucket.key,
      bucketLabel: bucket.label,
      value,
      absoluteValue: Math.abs(value),
      previousValue: compValue,
      deltaValue,
      deltaPercentage,
      trendDirection: getChangeDirection(deltaValue ?? 0),
      isNegative: value < 0,
      isMutedZero: value === 0,
      isInProgress: bucket.isInProgress,
      hasData: true,
    }

    if (compareYear === null) {
      previousValue = value
    }
    return cell
  })
}

function getTotalServiceV2RowDescriptor(
  snapshot: ServiceMonthlySnapshot,
  level: TotalServiceRowLevel,
  nodeMap: Map<string, OrganizationNode>,
): { id: string; label: string; parentId: string | null } {
  if (level === "branch") {
    return {
      id: snapshot.branchId,
      label: nodeMap.get(snapshot.branchId)?.name ?? snapshot.branchId,
      parentId: null,
    }
  }

  if (level === "service_group") {
    const serviceGroup = normalizeServiceGroup(snapshot.serviceGroup)
    return {
      id: serviceGroup,
      label: serviceGroup,
      parentId: snapshot.branchId,
    }
  }

  if (level === "lead_am") {
    const leadId = snapshot.leadId ?? "unassigned-lead"
    return {
      id: leadId,
      label: leadId === "unassigned-lead"
        ? "Unassigned Lead"
        : nodeMap.get(leadId)?.name ?? leadId,
      parentId: snapshot.branchId,
    }
  }

  if (level === "am") {
    const amId = snapshot.amId ?? "unassigned-am"
    return {
      id: amId,
      label: amId === "unassigned-am"
        ? "Unassigned AM"
        : nodeMap.get(amId)?.name ?? amId,
      parentId: snapshot.leadId ?? snapshot.branchId,
    }
  }

  if (level === "service") {
    return {
      id: snapshot.productServiceId,
      label: snapshot.serviceType,
      parentId: snapshot.amId ?? snapshot.branchId,
    }
  }

  return {
    id: snapshot.custId,
    label: snapshot.custId,
    parentId: snapshot.productServiceId,
  }
}

function buildTotalServiceV2Rows(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  state: TotalServiceDashboardState,
  nodes: OrganizationNode[],
  forcedLevel?: TotalServiceRowLevel,
): TotalServiceV2MatrixRow[] {
  const nodeMap = buildNodeMap(nodes)
  const level = forcedLevel ?? getTotalServiceV2CurrentLevel(state)

  const grouped = new Map<string, ServiceMonthlySnapshot[]>()
  const meta = new Map<string, { label: string; parentId: string | null }>()

  for (const snapshot of snapshots) {
    const descriptor = getTotalServiceV2RowDescriptor(snapshot, level, nodeMap)
    const items = grouped.get(descriptor.id) ?? []
    items.push(snapshot)
    grouped.set(descriptor.id, items)

    if (!meta.has(descriptor.id)) {
      meta.set(descriptor.id, {
        label: descriptor.label,
        parentId: descriptor.parentId,
      })
    }
  }

  const nextLevel = getNextRowLevel(state.povMode, level)

  return [...grouped.entries()]
    .map(([id, rowSnapshots]) => {
      const cells = buildTotalServiceV2Cells(
        rowSnapshots,
        buckets,
        state.metricMode,
        state.granularity,
        state.year,
        state.compareYear,
      )
      const latestValue = cells.at(-1)?.value ?? 0
      // Flow metrics sum across buckets; stock metrics report the end-of-period
      // count (active services at the latest month) instead of a meaningless sum.
      const totalAcrossBuckets = isFlowMetric(state.metricMode)
        ? cells.reduce((total, cell) => total + cell.value, 0)
        : getStockValueAtLatestPeriod(rowSnapshots)
      const rowMeta = meta.get(id)

      const children = nextLevel
        ? buildTotalServiceV2Rows(rowSnapshots, buckets, state, nodes, nextLevel)
        : undefined

      return {
        id,
        label: rowMeta?.label ?? id,
        level,
        parentId: rowMeta?.parentId ?? null,
        latestValue,
        totalAcrossBuckets,
        cells,
        children,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

function buildTotalServiceV2ChartSeries(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  metricMode: TotalServiceMetricMode,
  compareYear: number | null = null,
): TotalServiceV2ChartPoint[] {
  return buckets.map((bucket) => {
    const value = getMetricValueForBucket(snapshots, bucket, metricMode)
    
    let compareValue: number | undefined = undefined;
    if (compareYear !== null) {
      const comparisonPeriods = bucket.periods.map((period) => {
        const parsed = parseMonthlyPeriod(period)
        if (!parsed) return period
        return buildMonthPeriod(compareYear, parsed.month)
      })
      const comparisonBucket: TotalServiceV2TimeBucket = {
        ...bucket,
        periods: comparisonPeriods,
        startPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[0]),
        endPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[bucket.monthNumbers.length - 1]),
      }
      const hasData = snapshots.some((s) => comparisonPeriods.includes(s.period))
      compareValue = hasData ? getMetricValueForBucket(snapshots, comparisonBucket, metricMode) : 0
    }

    return {
      bucketKey: bucket.key,
      label: bucket.label,
      value,
      absoluteValue: Math.abs(value),
      isNegative: value < 0,
      isInProgress: bucket.isInProgress,
      compareValue,
    }
  })
}

function buildTotalServiceV2Summary(
  chartSeries: TotalServiceV2ChartPoint[],
  metricMode: TotalServiceMetricMode,
  granularity: TotalServiceGranularity,
  povMode: TotalServicePovMode,
  lastUpdatedAt: string | null,
  initialPreviousValue?: number | null,
): TotalServiceV2Summary {
  const latestPoint =
    [...chartSeries].reverse().find((point) => point.value !== 0) ??
    chartSeries.at(-1) ??
    null

  const latestIndex = latestPoint
    ? chartSeries.findIndex((point) => point.bucketKey === latestPoint.bucketKey)
    : -1

  const previousPoint = latestIndex > 0 ? chartSeries[latestIndex - 1] : null

  return {
    headlineValue: latestPoint?.value ?? 0,
    // Stock metrics: the "total" is the end-of-period count (latest bucket),
    // not the sum across buckets. Flow metrics keep the running sum.
    totalAcrossBuckets: isFlowMetric(metricMode)
      ? chartSeries.reduce((total, point) => total + point.value, 0)
      : latestPoint?.value ?? 0,
    latestBucketKey: latestPoint?.bucketKey ?? null,
    latestBucketLabel: latestPoint?.label ?? null,
    deltaFromPreviousBucket:
      latestPoint
        ? previousPoint
          ? latestPoint.value - previousPoint.value
          : latestIndex === 0 && initialPreviousValue !== undefined && initialPreviousValue !== null
            ? latestPoint.value - initialPreviousValue
            : null
        : null,
    deltaPercentageFromPreviousBucket:
      latestPoint
        ? previousPoint
          ? calculateDeltaPercentage(latestPoint.value, previousPoint.value)
          : latestIndex === 0 && initialPreviousValue !== undefined && initialPreviousValue !== null
            ? calculateDeltaPercentage(latestPoint.value, initialPreviousValue)
            : null
        : null,
    metricMode,
    granularity,
    povMode,
    lastUpdatedAt,
    initialPreviousValue: initialPreviousValue ?? null,
  }
}

// ==========================================================
// [TOTAL-SERVICE-V2:ENTRYPOINT]
// ==========================================================

export function buildTotalServiceV2DashboardData(params: {
  snapshots: ServiceMonthlySnapshot[]
  nodes: OrganizationNode[]
  access: UserAccessScope
  state: TotalServiceDashboardState
}): TotalServiceV2DashboardData {
  const { snapshots, nodes, access, state } = params

  const scopedSnapshots = applyRoleScope(snapshots, access, nodes)
  const stateWarnings = collectTotalServiceV2StateWarnings(state, access, nodes)
  const snapshotWarnings = collectTotalServiceWarnings(scopedSnapshots)

  const filteredSnapshots = applyTotalServiceV2DrilldownPath(
    applyTotalServiceV2RelevantFilters(scopedSnapshots, state),
    state,
  )

  // Data availability is metric-specific. `new_service` legitimately has rows
  // for the current in-progress month (fresh activations), but the stock/churn
  // metrics only have data once the month-end excerpt exists. Deriving buckets
  // from active/churn/block-bearing rows keeps an activation-only month (e.g.
  // the current month with no excerpt yet) from showing a bogus 0 / -100%.
  const bucketSourceSnapshots =
    state.metricMode === "new_service"
      ? filteredSnapshots
      : filteredSnapshots.filter(
          (s) =>
            getActiveCount(s) > 0 ||
            getChurnCount(s) > 0 ||
            s.blockServiceCount > 0,
        )

  const buckets = buildTotalServiceV2TimeBuckets(
    state.granularity,
    state.year,
    bucketSourceSnapshots,
  )

  const rows = buildTotalServiceV2Rows(
    filteredSnapshots,
    buckets,
    state,
    nodes,
  )

  const chartSeries = buildTotalServiceV2ChartSeries(
    filteredSnapshots,
    buckets,
    state.metricMode,
    state.compareYear,
  )

  const prevBucket = getPreviousBucket(state.granularity, state.year)
  const initialPreviousValue = getMetricValueForBucket(filteredSnapshots, prevBucket, state.metricMode)

  const summary = buildTotalServiceV2Summary(
    chartSeries,
    state.metricMode,
    state.granularity,
    state.povMode,
    getLatestGeneratedAt(filteredSnapshots),
    initialPreviousValue,
  )

  return {
    summary,
    buckets,
    rows,
    chartSeries,
    warnings: [...stateWarnings, ...snapshotWarnings],
    currentRowLevel: getTotalServiceV2CurrentLevel(state),
    contextualDetailTarget:
      state.drilldownPath.length > 0 ? state.drilldownPath[state.drilldownPath.length - 1] : null,
    initialPreviousValue,
    isEmpty: filteredSnapshots.length === 0,
  }
}

// ==========================================================
// [TOTAL-SERVICE-V2:EXPORT]
// ==========================================================

export type TotalServiceV2ExportRow = Record<
  string,
  string | number | boolean | null
>

function formatTotalServiceV2ExportMetric(metricMode: TotalServiceMetricMode): string {
  if (metricMode === "accumulation") return "accumulation"
  if (metricMode === "total_service") return "total_service"
  if (metricMode === "new_service") return "new_service"
  return "churn"
}

function formatTotalServiceV2ExportGranularity(
  granularity: TotalServiceGranularity,
): string {
  return granularity
}

function formatTotalServiceV2ExportPov(povMode: TotalServicePovMode): string {
  return povMode
}

function serializeTotalServiceV2DrilldownPath(
  path: TotalServiceDrilldownNode[],
): string {
  if (path.length === 0) return "root"
  return path.map((item) => `${item.level}:${item.label}`).join(" > ")
}

export function buildTotalServiceV2ExportRows(params: {
  dashboard: TotalServiceV2DashboardData
  state: TotalServiceDashboardState
}): TotalServiceV2ExportRow[] {
  const { dashboard, state } = params

  return dashboard.rows.map((row) => {
    const base: TotalServiceV2ExportRow = {
      pov_mode: formatTotalServiceV2ExportPov(state.povMode),
      metric_mode: formatTotalServiceV2ExportMetric(state.metricMode),
      granularity: formatTotalServiceV2ExportGranularity(state.granularity),
      year: state.year,
      current_row_level: dashboard.currentRowLevel,
      entity_level: row.level,
      entity_id: row.id,
      entity_label: row.label,
      parent_id: row.parentId,
      latest_value: row.latestValue,
      total_across_buckets: row.totalAcrossBuckets,
      drilldown_path: serializeTotalServiceV2DrilldownPath(state.drilldownPath),
      filter_branch_id: state.filters.branchId,
      filter_lead_id: state.filters.leadId,
      filter_am_id: state.filters.amId,
      filter_service_group: state.filters.serviceGroup,
      include_partial_data: state.filters.includePartialData,
      summary_headline_value: dashboard.summary.headlineValue,
      summary_total_across_buckets: dashboard.summary.totalAcrossBuckets,
      summary_latest_bucket_key: dashboard.summary.latestBucketKey,
      summary_latest_bucket_label: dashboard.summary.latestBucketLabel,
      summary_delta_from_previous_bucket: dashboard.summary.deltaFromPreviousBucket,
      summary_delta_percentage_from_previous_bucket:
        dashboard.summary.deltaPercentageFromPreviousBucket,
      last_updated_at: dashboard.summary.lastUpdatedAt,
    }

    for (const cell of row.cells) {
      base[`${cell.bucketKey}__label`] = cell.bucketLabel
      base[`${cell.bucketKey}__value`] = cell.value
      base[`${cell.bucketKey}__absolute_value`] = cell.absoluteValue
      base[`${cell.bucketKey}__previous_value`] = cell.previousValue
      base[`${cell.bucketKey}__delta_value`] = cell.deltaValue
      base[`${cell.bucketKey}__delta_percentage`] = cell.deltaPercentage
      base[`${cell.bucketKey}__trend_direction`] = cell.trendDirection
      base[`${cell.bucketKey}__is_negative`] = cell.isNegative
      base[`${cell.bucketKey}__is_muted_zero`] = cell.isMutedZero
      base[`${cell.bucketKey}__is_in_progress`] = cell.isInProgress
    }

    return base
  })
}

export function buildTotalServiceV2ExportFileName(params: {
  state: TotalServiceDashboardState
  currentRowLevel: TotalServiceRowLevel
}): string {
  const { state, currentRowLevel } = params

  const safePov = formatTotalServiceV2ExportPov(state.povMode)
  const safeMetric = formatTotalServiceV2ExportMetric(state.metricMode)
  const safeGranularity = formatTotalServiceV2ExportGranularity(state.granularity)
  const safeLevel = currentRowLevel

  return [
    "total-service",
    safePov,
    safeMetric,
    safeGranularity,
    state.year,
    safeLevel,
  ].join("-") + ".csv"
}

