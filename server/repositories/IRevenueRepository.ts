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
  periods: string[];
  level?: RevenueDetailLevel | null;
  entityId?: string | null;
}

export interface IRevenueRepository {
  findRevenueSnapshotsByYears(years: number[]): Promise<RevenuePayload>;
  findRevenueDetails(params: RevenueDetailParams, years: number[]): Promise<EnrichedDetailRow[]>;
}
