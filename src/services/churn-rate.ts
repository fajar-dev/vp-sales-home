import { ServiceMonthlySnapshot } from "@/types/entities";
import {
  TotalServiceV2DashboardData,
  diffInMonths,
  getServiceStartPeriods,
  getEnrichedRowsForModal,
} from "@/services/total-service";

// Re-exporting shared utilities from total-service to avoid duplication
export { diffInMonths, getServiceStartPeriods, getEnrichedRowsForModal };

/**
 * Filters snapshots based on tenure filter selection
 */
export function filterSnapshotsByTenure(
  snapshots: ServiceMonthlySnapshot[],
  serviceStartPeriods: Map<string, string>,
  tenureFilter: string
): ServiceMonthlySnapshot[] {
  return snapshots.filter((snapshot) => {
    const start = serviceStartPeriods.get(snapshot.serviceId) || snapshot.period;
    const months = diffInMonths(start, snapshot.period);
    
    if (tenureFilter === "all") return true;
    if (tenureFilter === "lt_1_year") return months <= 12;
    if (tenureFilter === "2_3_years") return months > 12 && months <= 36;
    if (tenureFilter === "3_4_years") return months > 36 && months <= 48;
    if (tenureFilter === "4_5_years") return months > 48 && months <= 60;
    if (tenureFilter === "gt_5_year") return months > 60;
    return true;
  });
}

/**
 * Processes standard dashboard data for Churn Rate report.
 * Directly returns standard monthly aggregations (no accumulation / running sum).
 */
export function processDashboardData(rawDashboard: TotalServiceV2DashboardData): TotalServiceV2DashboardData {
  return rawDashboard;
}

