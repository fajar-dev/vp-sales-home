import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";

export interface SnapshotsPayload {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
}

export interface ISnapshotRepository {
  /**
   * Aggregated service counts per month × (branch, service group, service,
   * lead, AM). `tenure` optionally restricts rows to services whose
   * subscription age (at each snapshot month) falls in the given bucket.
   */
  findSnapshotsByYears(years: number[], tenure?: string | null): Promise<SnapshotsPayload>;
}
