import type {
  ServiceMonthlySnapshot,
  TotalServiceMetricMode,
} from "@/types/entities";
import { UNMAPPED_LABEL } from "../constants";

export type ChangeDirection = "up" | "down" | "flat";

/**
 * Rounds a number to two decimal places.
 */
export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates percentage delta change between current and previous values.
 */
export function calculateDeltaPercentage(
  currentValue: number,
  previousValue: number,
): number | null {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : null;
  }
  return roundToTwo(((currentValue - previousValue) / previousValue) * 100);
}

/**
 * Translates numeric delta into standard change direction string.
 */
export function getChangeDirection(delta: number): ChangeDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * Standardizes unassigned or empty service groups.
 */
export function normalizeServiceGroup(
  value: string | null | undefined,
): string {
  const normalized = value?.trim();
  return normalized ? normalized : UNMAPPED_LABEL;
}

/**
 * `new_service` / `churn` are flow metrics (events per month) → summed across a bucket's months.
 * `total_service` / `accumulation` are stock metrics (point-in-time count) → end-of-period value.
 */
export function isFlowMetric(
  metricMode: TotalServiceMetricMode | string,
): boolean {
  return metricMode === "new_service" || metricMode === "churn";
}

// Counts helpers from individual snapshot records
export function getActiveCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.activeServiceCount > 0) return snapshot.activeServiceCount;
  return snapshot.isActiveEndOfPeriod ? 1 : 0;
}

export function getChurnCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.churnServiceCount > 0) return snapshot.churnServiceCount;
  return snapshot.isChurnedInPeriod ? 1 : 0;
}

export function getBlockCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.blockServiceCount > 0) return snapshot.blockServiceCount;
  return snapshot.isBlockedInPeriod ? 1 : 0;
}

export function getNewServiceCount(snapshot: ServiceMonthlySnapshot): number {
  if (snapshot.newServiceCount > 0) return snapshot.newServiceCount;
  return snapshot.isRegisteredInPeriod ? 1 : 0;
}

/** New services whose invoice has been paid (real payment data from server). */
export function getHomepaidCount(snapshot: ServiceMonthlySnapshot): number {
  return snapshot.newPaidCount;
}

/** New services that already have an invoice (billed / connected). */
export function getHomeconnectCount(snapshot: ServiceMonthlySnapshot): number {
  return snapshot.newConnectedCount;
}

/**
 * Active-service count at the most recent month present in `snapshots`.
 */
export function getStockValueAtLatestPeriod(
  snapshots: ServiceMonthlySnapshot[],
): number {
  if (snapshots.length === 0) return 0;
  const latestPeriod = snapshots.reduce(
    (max, snapshot) => (snapshot.period > max ? snapshot.period : max),
    snapshots[0].period,
  );
  return snapshots
    .filter((snapshot) => snapshot.period === latestPeriod)
    .reduce((total, snapshot) => total + getActiveCount(snapshot), 0);
}

