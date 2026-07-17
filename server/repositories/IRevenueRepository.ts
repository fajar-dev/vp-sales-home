import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

export interface RevenuePayload {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
}

export type RevenueDetailLevel =
  | "branch"
  | "service_group"
  | "lead_am"
  | "am"
  | "service"
  | "customer"
  | "revenue_gap";

export interface RevenueDetailParams {
  /** ISO `YYYY-MM` months to include. */
  periods: string[];
  level?: RevenueDetailLevel | null;
  entityId?: string | null;
  /** When true only unpaid journal lines are returned (revenue gap). */
  unpaidOnly?: boolean;
}

export interface IRevenueRepository {
  findRevenueSnapshotsByYears(years: number[]): Promise<RevenuePayload>;
  findRevenueDetails(params: RevenueDetailParams): Promise<EnrichedDetailRow[]>;
}
