import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";

export interface SnapshotsPayload {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
}

export interface ISnapshotRepository {
  findSnapshotsByYears(years: number[]): Promise<SnapshotsPayload>;
}
