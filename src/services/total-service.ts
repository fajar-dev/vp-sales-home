import type {
  HierarchyLevel,
  OrganizationNode,
  OrganizationNodeType,
  ReportFilterState,
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
  roundToTwo,
  calculateDeltaPercentage,
  getChangeDirection,
  normalizeServiceGroup,
  parseMonthlyPeriod,
  buildMonthPeriod,
  getYearFromPeriod,
  getLatestAvailableMonthInYear,
  buildNodeMap,
  isDescendantOf,
  isNodeVisibleToUser,
  isSnapshotVisibleToUser,
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

const GLOBAL_LEVEL_ID = "global"
const GLOBAL_LEVEL_NAME = "Pusat"
const UNMAPPED_SERVICE_GROUP = "Unmapped"

function getActiveCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.activeServiceCount > 0) return snapshot.activeServiceCount
  return snapshot.isActiveEndOfPeriod ? 1 : 0
}

function getChurnCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.churnServiceCount > 0) return snapshot.churnServiceCount
  return snapshot.isChurnedInPeriod ? 1 : 0
}

function getBlockCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.blockServiceCount > 0) return snapshot.blockServiceCount
  return snapshot.isBlockedInPeriod ? 1 : 0
}

function sumActive(snapshots: ServiceMonthlySnapshot[]): number {
  return snapshots.reduce((total, item) => total + getActiveCount(item), 0)
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

export function collectTotalServiceWarnings(
  snapshots: ServiceMonthlySnapshot[],
): TotalServiceWarning[] {
  const warnings: TotalServiceWarning[] = []
  const seenByPeriodAndService = new Set<string>()

  for (const snapshot of snapshots) {
    const duplicateKey = `${snapshot.period}::${snapshot.serviceId}`

    if (seenByPeriodAndService.has(duplicateKey)) {
      warnings.push({
        code: "DUPLICATE_SNAPSHOT",
        severity: "error",
        message: `Duplicate snapshot ditemukan untuk service ${snapshot.serviceId} pada period ${snapshot.period}.`,
        snapshotId: snapshot.snapshotId,
      })
    } else {
      seenByPeriodAndService.add(duplicateKey)
    }

    if (snapshot.isActiveEndOfPeriod && snapshot.isChurnedInPeriod) {
      warnings.push({
        code: "INVALID_ACTIVE_AND_CHURN",
        severity: "error",
        message: `Snapshot ${snapshot.snapshotId} menandai active dan churn secara bersamaan.`,
        snapshotId: snapshot.snapshotId,
      })
    }

    if (snapshot.isActiveEndOfPeriod && snapshot.isBlockedInPeriod) {
      warnings.push({
        code: "INVALID_ACTIVE_AND_BLOCK",
        severity: "warning",
        message: `Snapshot ${snapshot.snapshotId} menandai active dan blocked secara bersamaan.`,
        snapshotId: snapshot.snapshotId,
      })
    }

    if (!snapshot.branchId) {
      warnings.push({
        code: "MISSING_BRANCH",
        severity: "error",
        message: `Snapshot ${snapshot.snapshotId} tidak memiliki branchId.`,
        snapshotId: snapshot.snapshotId,
      })
    }

    if (!snapshot.serviceGroup?.trim()) {
      warnings.push({
        code: "UNMAPPED_SERVICE_GROUP",
        severity: "warning",
        message: `Snapshot ${snapshot.snapshotId} tidak memiliki service group dan akan dimasukkan ke Unmapped.`,
        snapshotId: snapshot.snapshotId,
      })
    }

    if (snapshot.dataCompletenessStatus !== "complete") {
      warnings.push({
        code: "PARTIAL_DATA",
        severity: snapshot.dataCompletenessStatus === "missing_dependency" ? "error" : "warning",
        message: `Snapshot ${snapshot.snapshotId} memiliki status data ${snapshot.dataCompletenessStatus}.`,
        snapshotId: snapshot.snapshotId,
      })
    }
  }

  return warnings
}

// ==========================================================
// [TOTAL-SERVICE-V2:TIME-BUCKETS]
// ==========================================================

export function buildTotalServiceV2TimeBuckets(
  granularity: TotalServiceGranularity,
  year: number,
  snapshots: ServiceMonthlySnapshot[],
): TotalServiceV2TimeBucket[] {
  const latestAvailableMonth = getLatestAvailableMonthInYear(snapshots, year)

  const bucketConfigs: Array<{ key: string; label: string; monthNumbers: number[] }> =
    granularity === "month"
      ? Array.from({ length: 12 }, (_, index) => {
          const month = index + 1
          return {
            key: buildMonthPeriod(year, month),
            label: new Date(year, month - 1, 1).toLocaleDateString("id-ID", {
              month: "short",
            }),
            monthNumbers: [month],
          }
        })
      : granularity === "quarter"
        ? [
            { key: `${year}-Q1`, label: "Kuartal 1", monthNumbers: [1, 2, 3] },
            { key: `${year}-Q2`, label: "Kuartal 2", monthNumbers: [4, 5, 6] },
            { key: `${year}-Q3`, label: "Kuartal 3", monthNumbers: [7, 8, 9] },
            { key: `${year}-Q4`, label: "Kuartal 4", monthNumbers: [10, 11, 12] },
          ]
      : granularity === "semester"
        ? [
            { key: `${year}-S1`, label: "Semester 1", monthNumbers: [1, 2, 3, 4, 5, 6] },
            { key: `${year}-S2`, label: "Semester 2", monthNumbers: [7, 8, 9, 10, 11, 12] },
          ]
          : [
              {
                key: String(year),
                label: String(year),
                monthNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
              },
            ]

  return bucketConfigs.map((bucket) => {
    const periods = bucket.monthNumbers.map((month) => buildMonthPeriod(year, month))
    const startMonth = bucket.monthNumbers[0]
    const endMonth = bucket.monthNumbers[bucket.monthNumbers.length - 1]

    const hasData = bucket.monthNumbers.some(
      (month) => latestAvailableMonth !== null && month <= latestAvailableMonth,
    )

    const isInProgress =
      latestAvailableMonth !== null &&
      latestAvailableMonth >= startMonth &&
      latestAvailableMonth < endMonth

    return {
      key: bucket.key,
      label: bucket.label,
      startPeriod: buildMonthPeriod(year, startMonth),
      endPeriod: buildMonthPeriod(year, endMonth),
      periods,
      monthNumbers: bucket.monthNumbers,
      hasData,
      isInProgress,
    }
  })
}

export function getPreviousBucket(
  granularity: TotalServiceGranularity,
  year: number,
): TotalServiceV2TimeBucket {
  const prevYear = year - 1
  let key: string
  let label: string
  let monthNumbers: number[]

  switch (granularity) {
    case "month":
      key = buildMonthPeriod(prevYear, 12)
      label = "Des " + prevYear
      monthNumbers = [12]
      break
    case "quarter":
      key = `${prevYear}-Q4`
      label = "Kuartal 4 " + prevYear
      monthNumbers = [10, 11, 12]
      break
    case "semester":
      key = `${prevYear}-S2`
      label = "Semester 2 " + prevYear
      monthNumbers = [7, 8, 9, 10, 11, 12]
      break
    case "year":
      key = String(prevYear)
      label = String(prevYear)
      monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      break
  }

  const periods = monthNumbers.map((m) => buildMonthPeriod(prevYear, m))

  return {
    key,
    label,
    startPeriod: periods[0],
    endPeriod: periods[periods.length - 1],
    periods,
    monthNumbers,
    hasData: true,
    isInProgress: false,
  }
}

// ==========================================================
// [TOTAL-SERVICE-V2:POV-FILTERS]
// ==========================================================

export function getTotalServiceV2RootLevel(
  povMode: TotalServicePovMode,
): TotalServiceRowLevel {
  return "branch"
}

export function getTotalServiceV2CurrentLevel(
  state: TotalServiceDashboardState,
): TotalServiceRowLevel {
  const operationalLevels: TotalServiceRowLevel[] = [
    "branch",
    "service_group",
    "service",
    "category",
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
    "category",
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
      if (node.level === "service") return snapshot.serviceId === node.id
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

  return bucketSnapshots.reduce((total, snapshot) => total + getActiveCount(snapshot), 0)
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
      id: snapshot.serviceId,
      label: snapshot.serviceId,
      parentId: snapshot.amId ?? snapshot.branchId,
    }
  }

  return {
    id: "category",
    label: "Category",
    parentId: snapshot.serviceId,
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
      const totalAcrossBuckets = cells.reduce((total, cell) => total + cell.value, 0)
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
    totalAcrossBuckets: chartSeries.reduce((total, point) => total + point.value, 0),
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

  const buckets = buildTotalServiceV2TimeBuckets(
    state.granularity,
    state.year,
    filteredSnapshots,
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

/**
 * Calculates month difference between p1 and p2 (format: YYYY-MM)
 */
export function diffInMonths(p1: string, p2: string): number {
  const [y1, m1] = p1.split("-").map(Number)
  const [y2, m2] = p2.split("-").map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/**
 * Mappings of service start dates, with simulated historic start periods
 * to populate the tenure categories (e.g. 2-3 years, 4-5 years, etc.) deterministically.
 */
export function getServiceStartPeriods(snapshots: ServiceMonthlySnapshot[]): Map<string, string> {
  const map = new Map<string, string>()
  snapshots.forEach((s) => {
    const existing = map.get(s.serviceId)
    if (!existing || s.period < existing) {
      map.set(s.serviceId, s.period)
    }
  })

  const simulatedMap = new Map<string, string>()
  map.forEach((actualStart, serviceId) => {
    const num = parseInt(serviceId.replace(/\D/g, "")) || 0
    let start = actualStart
    if (num % 7 === 0) {
      start = "2020-01" // > 5 years tenure
    } else if (num % 5 === 0) {
      start = "2021-01" // 4-5 years tenure
    } else if (num % 3 === 0) {
      start = "2022-01" // 3-4 years tenure
    } else if (num % 2 === 0) {
      start = "2023-01" // 2-3 years tenure
    } else {
      start = num % 9 === 0 ? "2025-01" : actualStart
    }
    simulatedMap.set(serviceId, start)
  })
  return simulatedMap
}

export interface EnrichedModalRow {
  serviceId: string
  customerName: string
  serviceName: string
  branchName: string | null
  leadName: string | null
  amName: string | null
  serviceGroup: string
  installationAddress: string
  generatedAt: string
  currentStatus: "churned" | "active" | "inactive"
  currentTotalActive: number
  bandwidthMbps: number
  expectedRevenue: number
  activeDate?: string
  churnDate?: string
  tenureText?: string
}

export function getEnrichedRowsForModal(params: {
  detailModal: { isOpen: boolean; entityId: string | null; level: string | null; period: string | null }
  year: number
  buckets: Array<{ key: string; periods: string[] }>
  metricMode: string
  snapshots: ServiceMonthlySnapshot[]
  organizationNodes: OrganizationNode[]
  subMetricFilter?: string | null
}): EnrichedModalRow[] {
  const { detailModal, year, buckets, metricMode, snapshots, organizationNodes, subMetricFilter } = params
  // Allow period-only opens (e.g. clicking a period row in TrendMatrixTable):
  // entityId and level can be null as long as a period is provided.
  if (!detailModal.isOpen) return []
  if (!detailModal.entityId && !detailModal.period) return []

  let targetPeriods: string[] = []
  if (detailModal.period) {
    const bucket = buckets.find((b) => b.key === detailModal.period)
    if (bucket) {
      targetPeriods = bucket.periods
    } else {
      targetPeriods = [detailModal.period]
    }
  }

  const relevantSnapshots = snapshots.filter((s) => {
    if (targetPeriods.length > 0) {
      if (!targetPeriods.includes(s.period)) return false
    } else {
      if (!s.period.startsWith(String(year))) return false
    }

    if (detailModal.level === "branch") return s.branchId === detailModal.entityId
    if (detailModal.level === "lead_am") return s.leadId === detailModal.entityId
    if (detailModal.level === "am") return s.amId === detailModal.entityId
    if (detailModal.level === "service_group") return s.serviceGroup === detailModal.entityId
    if (detailModal.level === "service") return s.serviceId === detailModal.entityId
    return true
  })

  const filteredSnapshots: ServiceMonthlySnapshot[] = []

  if (metricMode === "total_service") {
    const availablePeriods = Array.from(new Set(relevantSnapshots.map((s) => s.period)))
      .sort()
      .reverse()
    const lastPeriod = availablePeriods[0]

    relevantSnapshots
      .filter((s) => s.period === lastPeriod && s.activeServiceCount > 0)
      .forEach((s) => filteredSnapshots.push(s))
  } else if (metricMode === "new_service") {
    const serviceIds = new Set<string>()
    relevantSnapshots.forEach((s) => {
      if (s.newServiceCount > 0 || s.isRegisteredInPeriod) serviceIds.add(s.serviceId)
    })
    serviceIds.forEach((id) => {
      const firstNew = relevantSnapshots
        .filter((s) => s.serviceId === id && (s.newServiceCount > 0 || s.isRegisteredInPeriod))
        .sort((a, b) => a.period.localeCompare(b.period))[0]
      if (firstNew) filteredSnapshots.push(firstNew)
    })

    // Apply sub-metric filter: only keep services matching the clicked column
    if (subMetricFilter === "homepaid") {
      const keep = filteredSnapshots.filter((s) => s.isPaidInPeriod)
      filteredSnapshots.length = 0
      keep.forEach((s) => filteredSnapshots.push(s))
    } else if (subMetricFilter === "homeconnect") {
      const keep = filteredSnapshots.filter((s) => s.isConnectedInPeriod)
      filteredSnapshots.length = 0
      keep.forEach((s) => filteredSnapshots.push(s))
    } else if (subMetricFilter === "block") {
      const keep = filteredSnapshots.filter((s) => s.isBlockedInPeriod)
      filteredSnapshots.length = 0
      keep.forEach((s) => filteredSnapshots.push(s))
    }
  } else if (metricMode === "churn") {
    const serviceIds = new Set<string>()
    relevantSnapshots.forEach((s) => {
      if (s.churnServiceCount > 0 || s.isChurnedInPeriod) serviceIds.add(s.serviceId)
    })
    serviceIds.forEach((id) => {
      const firstChurn = relevantSnapshots
        .filter((s) => s.serviceId === id && (s.churnServiceCount > 0 || s.isChurnedInPeriod))
        .sort((a, b) => a.period.localeCompare(b.period))[0]
      if (firstChurn) filteredSnapshots.push(firstChurn)
    })
  } else {
    // If not matching any specific metric mode, just return all relevant snapshots (as in basic page fallback)
    relevantSnapshots.forEach((s) => filteredSnapshots.push(s))
  }

  const nodeMap = new Map(organizationNodes.map((n) => [n.id, n]))
  const serviceStartPeriods = getServiceStartPeriods(snapshots)

  return filteredSnapshots.map((snapshot) => {
    const idNumber = snapshot.serviceId.split("-")[1] || "000"
    const idInt = parseInt(idNumber)

    // For new_service: activeDate = period when service was first registered (snapshot.period),
    // because filteredSnapshots already holds the first snapshot where isRegisteredInPeriod === true.
    // For other modes: use the simulated/historical start period from serviceStartPeriods.
    const startPeriod = metricMode === "new_service"
      ? snapshot.period
      : (serviceStartPeriods.get(snapshot.serviceId) || snapshot.period)
    const activeDay = 1 + (idInt % 25)
    const activeDate = `${startPeriod}-${String(activeDay).padStart(2, "0")}`

    let churnDate: string | undefined = undefined
    let tenureText: string | undefined = undefined

    if (metricMode === "churn" || snapshot.isChurnedInPeriod) {
      const churnDay = 1 + ((idInt + 12) % 25)
      churnDate = `${snapshot.period}-${String(churnDay).padStart(2, "0")}`

      const startDate = new Date(activeDate)
      const endDate = new Date(churnDate)
      
      let years = endDate.getFullYear() - startDate.getFullYear()
      let months = endDate.getMonth() - startDate.getMonth()
      let days = endDate.getDate() - startDate.getDate()
      
      if (days < 0) {
        months -= 1
        const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0)
        days += prevMonth.getDate()
      }
      
      if (months < 0) {
        years -= 1
        months += 12
      }
      
      const parts: string[] = []
      if (years > 0) parts.push(`${years} tahun`)
      if (months > 0) parts.push(`${months} bulan`)
      if (days > 0) parts.push(`${days} hari`)
      
      tenureText = parts.length > 0 ? parts.join(" ") : "0 hari"
    }

    return {
      serviceId: snapshot.serviceId,
      customerName: `Customer ${idNumber}`,
      serviceName: `Service Package ${idNumber}`,
      branchName: nodeMap.get(snapshot.branchId)?.name ?? null,
      leadName: snapshot.leadId ? nodeMap.get(snapshot.leadId)?.name ?? null : null,
      amName: snapshot.amId ? nodeMap.get(snapshot.amId)?.name ?? null : null,
      serviceGroup: snapshot.serviceGroup,
      installationAddress: `Jalan Sudirman No. ${idNumber}, Kota ${nodeMap.get(snapshot.branchId)?.name ?? "Unknown"}`,
      generatedAt: snapshot.generatedAt,
      currentStatus: snapshot.isChurnedInPeriod ? "churned" : snapshot.isActiveEndOfPeriod ? "active" : "inactive",
      currentTotalActive: snapshot.activeServiceCount,
      bandwidthMbps: idInt % 3 === 0 ? 100 : idInt % 2 === 0 ? 50 : 20,
      expectedRevenue: snapshot.expectedRevenue,
      activeDate,
      churnDate,
      tenureText,
    }
  })
}
