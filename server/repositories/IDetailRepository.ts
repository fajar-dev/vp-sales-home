import type { EnrichedDetailRow } from "@/components/detail-table-modal";

export type ServiceDetailLevel =
  | "branch"
  | "service_group"
  | "lead_am"
  | "am"
  | "service"
  | "customer";

export type MetricMode = "total_service" | "churn";

export interface ServiceDetailParams {
  periods: string[];
  level?: ServiceDetailLevel | null;
  entityId?: string | null;
  metricMode?: MetricMode | null;
}

export type NewServiceDetailLevel =
  | "branch"
  | "service_group"
  | "lead_am"
  | "am"
  | "service"
  | "customer";

export interface NewServiceDetailParams {
  periods: string[];
  level?: NewServiceDetailLevel | null;
  entityId?: string | null;
}

export interface IDetailRepository {
  findServiceDetails(params: ServiceDetailParams): Promise<EnrichedDetailRow[]>;
  findNewServiceDetails(params: NewServiceDetailParams): Promise<EnrichedDetailRow[]>;
}
