import type { EnrichedDetailRow } from "@/components/detail-table-modal";

export type ServiceDetailLevel =
  | "branch"
  | "service_group"
  | "lead_am"
  | "am"
  | "service"
  | "customer";

export type MetricMode = "total_service" | "churn" | "block";

export type NewServiceSubMetric = "homepaid" | "homeconnect" | "block";

export interface ServiceDetailParams {
  /** ISO `YYYY-MM` months to include. */
  periods: string[];
  level?: ServiceDetailLevel | null;
  entityId?: string | null;
  metricMode?: MetricMode | null;
  /** Tenure bucket filter (mirrors the churn dashboard filter). */
  tenure?: string | null;
}

export interface NewServiceDetailParams {
  periods: string[];
  level?: ServiceDetailLevel | null;
  entityId?: string | null;
  subMetric?: NewServiceSubMetric | null;
}

export interface IDetailRepository {
  findServiceDetails(params: ServiceDetailParams): Promise<EnrichedDetailRow[]>;
  findNewServiceDetails(params: NewServiceDetailParams): Promise<EnrichedDetailRow[]>;
}
