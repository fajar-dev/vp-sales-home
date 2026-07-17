import type {
  OrganizationNode,
  ServiceMonthlySnapshot,
  TotalServiceDrilldownNode,
  TotalServiceGranularity,
  TotalServicePovMode,
  TotalServiceRowLevel,
  UserAccessScope,
} from "@/types/entities";
import {
  roundToTwo,
  calculateDeltaPercentage,
  getChangeDirection,
  normalizeServiceGroup,
  parseMonthlyPeriod,
  buildMonthPeriod,
  getYearFromPeriod,
  buildNodeMap,
  applyRoleScope,
} from "./shared-utils";
import type { TotalServiceChangeDirection } from "./shared-utils";

export interface NewServiceDashboardState {
  year: number;
  compareYear: number | null;
  povMode: TotalServicePovMode;
  displayMode: "performance" | "trend";
  granularity: TotalServiceGranularity;
  drilldownPath: TotalServiceDrilldownNode[];
  filters: {
    branchId: string | null;
    leadId: string | null;
    amId: string | null;
    serviceGroup: string | null;
    includePartialData: boolean;
  };
}

export interface TrendMetricCell {
  value: number;
  delta: number | null;
  deltaPercentage: number | null;
}

export interface NewServiceTrendRow {
  id: string; // Unique path-based ID e.g., "2025-01::branch-medan"
  label: string;
  level: "period" | TotalServiceRowLevel;
  parentId: string | null;
  totalNewService: TrendMetricCell;
  homepaid: TrendMetricCell;
  homeconnect: TrendMetricCell;
  block: TrendMetricCell;
  connectionRate: number; // percentage
  paymentRate: number; // percentage
  children?: NewServiceTrendRow[];
}



export interface TotalServiceV2TimeBucket {
  key: string;
  label: string;
  startPeriod: string;
  endPeriod: string;
  periods: string[];
  monthNumbers: number[];
  hasData: boolean;
  isInProgress: boolean;
}

export interface TotalServiceV2MatrixCell {
  bucketKey: string;
  bucketLabel: string;
  value: number;
  absoluteValue: number;
  previousValue: number | null;
  deltaValue: number | null;
  deltaPercentage: number | null;
  trendDirection: TotalServiceChangeDirection;
  isNegative: boolean;
  isMutedZero: boolean;
  isInProgress: boolean;
  /** False when the bucket has no snapshot data yet (future/not-run months). */
  hasData: boolean;
}

export interface TotalServiceV2MatrixRow {
  id: string;
  label: string;
  level: TotalServiceRowLevel;
  parentId: string | null;
  latestValue: number;
  totalAcrossBuckets: number;
  cells: TotalServiceV2MatrixCell[];
  children?: TotalServiceV2MatrixRow[];
}

export interface TotalServiceV2ChartPoint {
  bucketKey: string;
  label: string;
  value: number;
  absoluteValue: number;
  isNegative: boolean;
  isInProgress: boolean;
  compareValue?: number;
}

export interface TotalServiceV2Summary {
  headlineValue: number;
  totalAcrossBuckets: number;
  latestBucketKey: string | null;
  latestBucketLabel: string | null;
  deltaFromPreviousBucket: number | null;
  deltaPercentageFromPreviousBucket: number | null;
  metricMode: string;
  granularity: TotalServiceGranularity;
  povMode: TotalServicePovMode;
  lastUpdatedAt: string | null;
  initialPreviousValue: number | null;
}

export interface NewServiceDashboardData {
  summary: TotalServiceV2Summary;
  buckets: TotalServiceV2TimeBucket[];
  rows: TotalServiceV2MatrixRow[];
  trendRows: NewServiceTrendRow[];
  chartSeries: TotalServiceV2ChartPoint[];
  currentRowLevel: TotalServiceRowLevel;
  initialPreviousValue: number | null;
  isEmpty: boolean;
  /** Snapshots already scoped and filtered (role scope + year + drilldown). Use this for modal queries. */
  filteredSnapshots: ServiceMonthlySnapshot[];
}



function getNewServiceCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.newServiceCount > 0) return snapshot.newServiceCount;
  return snapshot.isRegisteredInPeriod ? 1 : 0;
}

// Funnel counts are pre-computed server-side from real billing data:
// homeconnect = new services that already have an invoice, homepaid = new
// services whose invoice batch has a receipt, block = currently blocked.
function getHomepaidCount(snapshot: ServiceMonthlySnapshot): number {
  return snapshot.newPaidCount;
}

function getHomeconnectCount(snapshot: ServiceMonthlySnapshot): number {
  return snapshot.newConnectedCount;
}

function getBlockCount(snapshot: ServiceMonthlySnapshot): number {
  return snapshot.newBlockedCount;
}

import {
  buildTimeBuckets as domainBuildTimeBuckets,
  getPreviousBucket as domainGetPreviousBucket,
} from "@/domain/calculators/time-bucket.calculator";

export function buildNewServiceTimeBuckets(
  granularity: TotalServiceGranularity,
  year: number,
  snapshots: ServiceMonthlySnapshot[]
): TotalServiceV2TimeBucket[] {
  return domainBuildTimeBuckets(granularity, year, snapshots);
}

export function getPreviousBucket(
  granularity: TotalServiceGranularity,
  year: number
): TotalServiceV2TimeBucket {
  return domainGetPreviousBucket(granularity, year);
}


export function getNewServiceCurrentLevel(
  state: NewServiceDashboardState
): TotalServiceRowLevel {
  const operationalLevels: TotalServiceRowLevel[] = [
    "branch",
    "service_group",
    "service",
  ];
  const salesLevels: TotalServiceRowLevel[] = [
    "branch",
    "lead_am",
    "am",
    "service",
  ];
  const levels = state.povMode === "operational" ? operationalLevels : salesLevels;
  return levels[Math.min(state.drilldownPath.length, levels.length - 1)];
}

export function getNextRowLevel(
  povMode: TotalServicePovMode,
  currentLevel: TotalServiceRowLevel
): TotalServiceRowLevel | null {
  const operationalFlow: TotalServiceRowLevel[] = [
    "branch",
    "service_group",
    "service",
  ];
  const salesFlow: TotalServiceRowLevel[] = ["branch", "lead_am", "am", "service"];
  const flow = povMode === "operational" ? operationalFlow : salesFlow;
  const index = flow.indexOf(currentLevel);
  if (index === -1 || index === flow.length - 1) return null;
  return flow[index + 1];
}

function applyNewServiceRelevantFilters(
  snapshots: ServiceMonthlySnapshot[],
  state: NewServiceDashboardState
): ServiceMonthlySnapshot[] {
  return snapshots.filter((snapshot) => {
    const periodYear = getYearFromPeriod(snapshot.period);
    if (
      periodYear !== state.year &&
      periodYear !== state.year - 1 &&
      (state.compareYear === null || periodYear !== state.compareYear)
    ) {
      return false;
    }

    if (state.filters.branchId && snapshot.branchId !== state.filters.branchId) {
      return false;
    }

    if (state.povMode === "sales") {
      if (state.filters.leadId && snapshot.leadId !== state.filters.leadId) return false;
      if (state.filters.amId && snapshot.amId !== state.filters.amId) return false;
    }

    if (state.povMode === "operational") {
      if (
        state.filters.serviceGroup &&
        normalizeServiceGroup(snapshot.serviceGroup) !== state.filters.serviceGroup
      ) {
        return false;
      }
    }

    if (!state.filters.includePartialData && snapshot.dataCompletenessStatus !== "complete") {
      return false;
    }

    return true;
  });
}

function applyNewServiceDrilldownPath(
  snapshots: ServiceMonthlySnapshot[],
  state: NewServiceDashboardState
): ServiceMonthlySnapshot[] {
  return state.drilldownPath.reduce((current, node) => {
    return current.filter((snapshot) => {
      if (node.level === "branch") return snapshot.branchId === node.id;
      if (node.level === "service_group") {
        return normalizeServiceGroup(snapshot.serviceGroup) === node.id;
      }
      if (node.level === "lead_am") {
        return (snapshot.leadId ?? "unassigned-lead") === node.id;
      }
      if (node.level === "am") {
        return (snapshot.amId ?? "unassigned-am") === node.id;
      }
      if (node.level === "service") return snapshot.productServiceId === node.id;
      if (node.level === "customer") return snapshot.custId === node.id;
      return true;
    });
  }, snapshots);
}

function getMetricValueForBucket(
  snapshots: ServiceMonthlySnapshot[],
  bucket: TotalServiceV2TimeBucket
): number {
  const bucketSnapshots = snapshots.filter((snapshot) =>
    bucket.periods.includes(snapshot.period)
  );
  return bucketSnapshots.reduce((total, snapshot) => total + getNewServiceCount(snapshot), 0);
}

function buildNewServiceCells(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  year: number,
  compareYear: number | null = null
): TotalServiceV2MatrixCell[] {
  const getComparisonValue = (bucket: TotalServiceV2TimeBucket): number | null => {
    if (compareYear === null) return null;
    const comparisonPeriods = bucket.periods.map((period) => {
      const parsed = parseMonthlyPeriod(period);
      if (!parsed) return period;
      return buildMonthPeriod(compareYear, parsed.month);
    });
    const comparisonBucket: TotalServiceV2TimeBucket = {
      ...bucket,
      periods: comparisonPeriods,
      startPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[0]),
      endPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[bucket.monthNumbers.length - 1]),
    };
    const hasData = snapshots.some((s) => comparisonPeriods.includes(s.period));
    return hasData ? getMetricValueForBucket(snapshots, comparisonBucket) : null;
  };

  const prevBucket = getPreviousBucket("month", year);
  let previousValue = getMetricValueForBucket(snapshots, prevBucket);

  return buckets.map((bucket) => {
    // No snapshot data yet (future / not-run months) → empty cell, no -100%.
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
      } satisfies TotalServiceV2MatrixCell;
    }

    const value = getMetricValueForBucket(snapshots, bucket);
    const compValue = compareYear !== null ? getComparisonValue(bucket) : previousValue;
    const deltaValue = compValue === null ? null : value - compValue;
    const deltaPercentage =
      compValue === null ? null : calculateDeltaPercentage(value, compValue);

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
    };

    if (compareYear === null) {
      previousValue = value;
    }
    return cell;
  });
}

function getNewServiceRowDescriptor(
  snapshot: ServiceMonthlySnapshot,
  level: TotalServiceRowLevel,
  nodeMap: Map<string, OrganizationNode>
): { id: string; label: string; parentId: string | null } {
  if (level === "branch") {
    return {
      id: snapshot.branchId,
      label: nodeMap.get(snapshot.branchId)?.name ?? snapshot.branchId,
      parentId: null,
    };
  }

  if (level === "service_group") {
    const serviceGroup = normalizeServiceGroup(snapshot.serviceGroup);
    return {
      id: serviceGroup,
      label: serviceGroup,
      parentId: snapshot.branchId,
    };
  }

  if (level === "lead_am") {
    const leadId = snapshot.leadId ?? "unassigned-lead";
    return {
      id: leadId,
      label: leadId === "unassigned-lead"
        ? "Unassigned Lead"
        : nodeMap.get(leadId)?.name ?? leadId,
      parentId: snapshot.branchId,
    };
  }

  if (level === "am") {
    const amId = snapshot.amId ?? "unassigned-am";
    return {
      id: amId,
      label: amId === "unassigned-am"
        ? "Unassigned AM"
        : nodeMap.get(amId)?.name ?? amId,
      parentId: snapshot.leadId ?? snapshot.branchId,
    };
  }

  if (level === "service") {
    return {
      id: snapshot.productServiceId,
      label: snapshot.serviceType,
      parentId: snapshot.amId ?? snapshot.branchId,
    };
  }

  return {
    id: snapshot.custId,
    label: snapshot.custId,
    parentId: snapshot.productServiceId,
  };
}

function buildNewServiceRows(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  state: NewServiceDashboardState,
  nodes: OrganizationNode[],
  forcedLevel?: TotalServiceRowLevel
): TotalServiceV2MatrixRow[] {
  const nodeMap = buildNodeMap(nodes);
  const level = forcedLevel ?? getNewServiceCurrentLevel(state);

  const grouped = new Map<string, ServiceMonthlySnapshot[]>();
  const meta = new Map<string, { label: string; parentId: string | null }>();

  for (const snapshot of snapshots) {
    const descriptor = getNewServiceRowDescriptor(snapshot, level, nodeMap);
    const items = grouped.get(descriptor.id) ?? [];
    items.push(snapshot);
    grouped.set(descriptor.id, items);

    if (!meta.has(descriptor.id)) {
      meta.set(descriptor.id, {
        label: descriptor.label,
        parentId: descriptor.parentId,
      });
    }
  }

  const nextLevel = getNextRowLevel(state.povMode, level);

  return [...grouped.entries()]
    .map(([id, rowSnapshots]) => {
      const cells = buildNewServiceCells(
        rowSnapshots,
        buckets,
        state.year,
        state.compareYear
      );
      const latestValue = cells.at(-1)?.value ?? 0;
      const totalAcrossBuckets = cells.reduce((total, cell) => total + cell.value, 0);
      const rowMeta = meta.get(id);

      const children = nextLevel
        ? buildNewServiceRows(rowSnapshots, buckets, state, nodes, nextLevel)
        : undefined;

      return {
        id,
        label: rowMeta?.label ?? id,
        level,
        parentId: rowMeta?.parentId ?? null,
        latestValue,
        totalAcrossBuckets,
        cells,
        children,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ==========================================================
// [TREND VIEW RECURSIVE BUILDER]
// ==========================================================

function buildMetricCell(
  currentSnapshots: ServiceMonthlySnapshot[],
  previousSnapshots: ServiceMonthlySnapshot[],
  metricGetter: (s: ServiceMonthlySnapshot) => number
): TrendMetricCell {
  const value = currentSnapshots.reduce((sum, s) => sum + metricGetter(s), 0);
  const previousValue = previousSnapshots.reduce((sum, s) => sum + metricGetter(s), 0);
  const delta = value - previousValue;
  const deltaPercentage = calculateDeltaPercentage(value, previousValue);

  return {
    value,
    delta: previousValue === 0 && value === 0 ? 0 : delta,
    deltaPercentage,
  };
}

function buildTrendChildRows(
  snapshots: ServiceMonthlySnapshot[],
  prevSnapshots: ServiceMonthlySnapshot[],
  level: TotalServiceRowLevel,
  state: NewServiceDashboardState,
  nodes: OrganizationNode[],
  parentPathId: string
): NewServiceTrendRow[] {
  const nodeMap = buildNodeMap(nodes);
  const grouped = new Map<string, ServiceMonthlySnapshot[]>();
  const prevGrouped = new Map<string, ServiceMonthlySnapshot[]>();
  const meta = new Map<string, { label: string; parentId: string | null }>();

  for (const snapshot of snapshots) {
    const descriptor = getNewServiceRowDescriptor(snapshot, level, nodeMap);
    const items = grouped.get(descriptor.id) ?? [];
    items.push(snapshot);
    grouped.set(descriptor.id, items);

    if (!meta.has(descriptor.id)) {
      meta.set(descriptor.id, {
        label: descriptor.label,
        parentId: descriptor.parentId,
      });
    }
  }

  for (const snapshot of prevSnapshots) {
    const descriptor = getNewServiceRowDescriptor(snapshot, level, nodeMap);
    const items = prevGrouped.get(descriptor.id) ?? [];
    items.push(snapshot);
    prevGrouped.set(descriptor.id, items);
  }

  const nextLevel = getNextRowLevel(state.povMode, level);

  return [...grouped.entries()]
    .map(([id, rowSnapshots]) => {
      const rowPrevSnapshots = prevGrouped.get(id) ?? [];
      const rowMeta = meta.get(id);
      const pathId = `${parentPathId}::${id}`;

      const totalNewService = buildMetricCell(rowSnapshots, rowPrevSnapshots, getNewServiceCount);
      const homepaid = buildMetricCell(rowSnapshots, rowPrevSnapshots, getHomepaidCount);
      const homeconnect = buildMetricCell(rowSnapshots, rowPrevSnapshots, getHomeconnectCount);
      const block = buildMetricCell(rowSnapshots, rowPrevSnapshots, getBlockCount);

      // homepaid ⊆ homeconnect, so the connection rate is just homeconnect/total.
      const connectionRate =
        totalNewService.value > 0
          ? roundToTwo((homeconnect.value / totalNewService.value) * 100)
          : 0;

      const paymentRate =
        totalNewService.value > 0
          ? roundToTwo((homepaid.value / totalNewService.value) * 100)
          : 0;

      const children = nextLevel
        ? buildTrendChildRows(rowSnapshots, rowPrevSnapshots, nextLevel, state, nodes, pathId)
        : undefined;

      return {
        id: pathId,
        label: rowMeta?.label ?? id,
        level,
        parentId: rowMeta?.parentId ?? null,
        totalNewService,
        homepaid,
        homeconnect,
        block,
        connectionRate,
        paymentRate,
        children,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

function buildNewServiceTrendRows(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  state: NewServiceDashboardState,
  nodes: OrganizationNode[]
): NewServiceTrendRow[] {
  // Group snapshots by period to speed up lookups
  const periodSnapshotsMap = new Map<string, ServiceMonthlySnapshot[]>();
  for (const snapshot of snapshots) {
    const items = periodSnapshotsMap.get(snapshot.period) ?? [];
    items.push(snapshot);
    periodSnapshotsMap.set(snapshot.period, items);
  }

  return buckets.map((bucket) => {
    // 1. Gather snapshots for current bucket
    const currentSnapshots = snapshots.filter((s) => bucket.periods.includes(s.period));

    // 2. Gather snapshots for previous bucket (to compute deltas correctly)
    const prevBucket = getPreviousBucket(state.granularity, state.year);
    
    // Find index of current bucket to get chronological previous bucket
    const currentIdx = buckets.findIndex((b) => b.key === bucket.key);
    const targetPeriods =
      currentIdx > 0
        ? buckets[currentIdx - 1].periods
        : prevBucket.periods;

    const previousSnapshots = snapshots.filter((s) => targetPeriods.includes(s.period));

    // 3. Aggregate root period cells
    const totalNewService = buildMetricCell(currentSnapshots, previousSnapshots, getNewServiceCount);
    const homepaid = buildMetricCell(currentSnapshots, previousSnapshots, getHomepaidCount);
    const homeconnect = buildMetricCell(currentSnapshots, previousSnapshots, getHomeconnectCount);
    const block = buildMetricCell(currentSnapshots, previousSnapshots, getBlockCount);

    const connectionRate =
      totalNewService.value > 0
        ? roundToTwo((homeconnect.value / totalNewService.value) * 100)
        : 0;

    const paymentRate =
      totalNewService.value > 0
        ? roundToTwo((homepaid.value / totalNewService.value) * 100)
        : 0;

    // 4. Recursively build child rows
    const children = buildTrendChildRows(
      currentSnapshots,
      previousSnapshots,
      "branch",
      state,
      nodes,
      bucket.key
    );

    return {
      id: bucket.key,
      label: bucket.label === "Jan" ? "Januari" :
             bucket.label === "Feb" ? "Februari" :
             bucket.label === "Mar" ? "Maret" :
             bucket.label === "Apr" ? "April" :
             bucket.label === "Mei" ? "Mei" :
             bucket.label === "Jun" ? "Juni" :
             bucket.label === "Jul" ? "Juli" :
             bucket.label === "Agu" ? "Agustus" :
             bucket.label === "Sep" ? "September" :
             bucket.label === "Okt" ? "Oktober" :
             bucket.label === "Nov" ? "November" :
             bucket.label === "Des" ? "Desember" : bucket.label,
      level: "period",
      parentId: null,
      totalNewService,
      homepaid,
      homeconnect,
      block,
      connectionRate,
      paymentRate,
      children,
    };
  });
}

// ==========================================================
// [CHART & SUMMARY]
// ==========================================================

function buildNewServiceChartSeries(
  snapshots: ServiceMonthlySnapshot[],
  buckets: TotalServiceV2TimeBucket[],
  compareYear: number | null = null
): TotalServiceV2ChartPoint[] {
  return buckets.map((bucket) => {
    const value = getMetricValueForBucket(snapshots, bucket);

    let compareValue: number | undefined = undefined;
    if (compareYear !== null) {
      const comparisonPeriods = bucket.periods.map((period) => {
        const parsed = parseMonthlyPeriod(period);
        if (!parsed) return period;
        return buildMonthPeriod(compareYear, parsed.month);
      });
      const comparisonBucket: TotalServiceV2TimeBucket = {
        ...bucket,
        periods: comparisonPeriods,
        startPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[0]),
        endPeriod: buildMonthPeriod(compareYear, bucket.monthNumbers[bucket.monthNumbers.length - 1]),
      };
      const hasData = snapshots.some((s) => comparisonPeriods.includes(s.period));
      compareValue = hasData ? getMetricValueForBucket(snapshots, comparisonBucket) : 0;
    }

    return {
      bucketKey: bucket.key,
      label: bucket.label,
      value,
      absoluteValue: Math.abs(value),
      isNegative: value < 0,
      isInProgress: bucket.isInProgress,
      compareValue,
    };
  });
}

function buildNewServiceSummary(
  chartSeries: TotalServiceV2ChartPoint[],
  granularity: TotalServiceGranularity,
  povMode: TotalServicePovMode,
  initialPreviousValue?: number | null
): TotalServiceV2Summary {
  const latestPoint =
    [...chartSeries].reverse().find((point) => point.value !== 0) ??
    chartSeries.at(-1) ??
    null;

  const latestIndex = latestPoint
    ? chartSeries.findIndex((point) => point.bucketKey === latestPoint.bucketKey)
    : -1;

  const previousPoint = latestIndex > 0 ? chartSeries[latestIndex - 1] : null;

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
    metricMode: "new_service",
    granularity,
    povMode,
    lastUpdatedAt: new Date().toISOString(),
    initialPreviousValue: initialPreviousValue ?? null,
  };
}

export function buildNewServiceDashboardData(params: {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  access: UserAccessScope;
  state: NewServiceDashboardState;
}): NewServiceDashboardData {
  const { snapshots, nodes, access, state } = params;

  const scopedSnapshots = applyRoleScope(snapshots, access, nodes);

  const filteredSnapshots = applyNewServiceDrilldownPath(
    applyNewServiceRelevantFilters(scopedSnapshots, state),
    state
  );

  const buckets = buildNewServiceTimeBuckets(
    state.granularity,
    state.year,
    filteredSnapshots
  );

  // Performance view matrix rows
  const rows = buildNewServiceRows(
    filteredSnapshots,
    buckets,
    state,
    nodes
  );

  // Trend view custom funnel rows
  const trendRows = buildNewServiceTrendRows(
    filteredSnapshots,
    buckets,
    state,
    nodes
  );

  const chartSeries = buildNewServiceChartSeries(
    filteredSnapshots,
    buckets,
    state.compareYear
  );

  const prevBucket = getPreviousBucket(state.granularity, state.year);
  const initialPreviousValue = getMetricValueForBucket(filteredSnapshots, prevBucket);

  const summary = buildNewServiceSummary(
    chartSeries,
    state.granularity,
    state.povMode,
    initialPreviousValue
  );

  return {
    summary,
    buckets,
    rows,
    trendRows,
    chartSeries,
    currentRowLevel: getNewServiceCurrentLevel(state),
    initialPreviousValue,
    isEmpty: filteredSnapshots.length === 0,
    filteredSnapshots,
  };
}
