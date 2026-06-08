export type ReportKey =
  | "total-service-active"
  | "new-customer"
  | "customer-churn-rate"
  | "total-revenue-home"

export type OrganizationNodeType =
  | "head_office"
  | "branch"
  | "lead_am"
  | "am"

export type HierarchyLevel =
  | "head_office"
  | "branch"
  | "lead_am"
  | "am"

export type ReportUserRole =
  | "am"
  | "lead_am"
  | "branch_manager"
  | "head_office"

export type ServiceLifecycleStatus =
  | "registered"
  | "connected"
  | "paid"
  | "active"
  | "blocked"
  | "churned"
  | "non_active"
  | "cancelled"

export type DataCompletenessStatus =
  | "complete"
  | "partial"
  | "delayed"
  | "missing_dependency"

export type TenureBucket =
  | "lt_3_months"
  | "3_to_6_months"
  | "6_to_12_months"
  | "12_to_24_months"
  | "gt_24_months"

export interface OrganizationNode {
  id: string
  type: OrganizationNodeType
  code: string
  name: string
  parentId: string | null
  managerUserId: string | null
  isActive: boolean
}

export interface UserAccessScope {
  userId: string
  fullName: string
  role: ReportUserRole
  organizationNodeId: string
  visibleNodeIds: string[]
  defaultReportScope: HierarchyLevel
  isActive: boolean
}

export interface CustomerAccount {
  custId: string
  accountNo: string
  homeId: string | null
  name: string
  email: string | null
  phoneNumber: string | null
  branchId: string
  businessType: string | null
  businessOperation: string | null
  totalAccount: number | null
  createdAt: string
  updatedAt: string
}

export interface ServiceSubscription {
  serviceId: string
  custId: string
  serviceName: string
  serviceGroup: string
  bandwidthMbps: number | null
  status: ServiceLifecycleStatus
  operatorId: string | null
  operatorFoName: string | null
  salesName: string | null
  salesManagerName: string | null
  mrr: number | null
  mrc: number | null
  monthlyPriceExcludingTax: number | null
  pricePerMbps: number | null
  discountAmount: number | null
  discountPerYear: number | null
  firstDiscountAmount: number | null
  subscriptionPeriodMonths: number | null
  paymentPeriodMonths: number | null
  firstActiveDate: string | null
  registrationDate: string | null
  nonActiveDate: string | null
  lastPaidInvoicePeriod: string | null
  tenureMonths: number | null
  tenureLabel: string | null
  tenureBucket: TenureBucket | null
  closeCategory: string | null
  closeCategoryReason: string | null
  currentBalance: number | null
  totalInvoiceAmount: number | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface ServiceMonthlySnapshot {
  snapshotId: string
  period: string
  serviceId: string
  custId: string
  branchId: string
  leadId: string | null
  amId: string | null
  serviceGroup: string
  isRegisteredInPeriod: boolean
  isConnectedInPeriod: boolean
  isPaidInPeriod: boolean
  isActiveEndOfPeriod: boolean
  isChurnedInPeriod: boolean
  isBlockedInPeriod: boolean
  expectedRevenue: number
  actualRevenue: number
  activeServiceCount: number
  newServiceCount: number
  churnServiceCount: number
  blockServiceCount: number
  dataCompletenessStatus: DataCompletenessStatus
  generatedAt: string
}

export interface ChurnEvent {
  churnEventId: string
  serviceId: string
  custId: string
  period: string
  churnDate: string
  churnReasonCategory: string
  churnReasonDetail: string | null
  tenureMonthsAtChurn: number | null
  tenureBucketAtChurn: TenureBucket | null
  branchId: string
  leadId: string | null
  amId: string | null
  sourceStatusBeforeChurn: ServiceLifecycleStatus
  isFinalized: boolean
  note: string | null
}

export interface FinancialTransaction {
  transactionId: string
  custId: string | null
  serviceId: string | null
  transactionDate: string
  inputDate: string
  accountCode: string
  counterpartAccountCode: string | null
  accountName: string
  counterpartAccountName: string | null
  voucherNumber: string | null
  description: string | null
  debitAmount: number
  creditAmount: number
  balanceAfterTransaction: number | null
  sourceSystem: string | null
}

export interface ReportMetadata {
  reportKey: ReportKey
  period: string
  lastUpdatedAt: string
  dataFreshnessLabel: string
  isPartialData: boolean
  partialDataMessage: string | null
  sourceOfTruthLabel: string
  generatedBy: string | null
}

export interface ReportFilterState {
  period: string
  comparisonPeriod: string | null
  hierarchyLevel: HierarchyLevel
  branchId: string | null
  leadId: string | null
  amId: string | null
  serviceGroup: string | null
  includePartialData: boolean
}

export type TotalServicePovMode = "operational" | "sales"

export type TotalServiceMetricMode =
  | "accumulation"
  | "total_service"
  | "new_service"
  | "churn"

export type TotalServiceGranularity =
  | "month"
  | "quarter"
  | "semester"
  | "year"

export type TotalServiceRowLevel =
  | "branch"
  | "service_group"
  | "lead_am"
  | "am"
  | "service"
  | "category"

export interface TotalServiceFilterState {
  branchId: string | null
  leadId: string | null
  amId: string | null
  serviceGroup: string | null
  includePartialData: boolean
}

export interface TotalServiceDrawerState {
  isOpen: boolean
  section: "filters" | "detail" | null
}

export interface TotalServiceDrilldownNode {
  level: TotalServiceRowLevel
  id: string
  label: string
}

export interface TotalServiceDashboardState {
  povMode: TotalServicePovMode
  metricMode: TotalServiceMetricMode
  granularity: TotalServiceGranularity
  year: number
  compareYear: number | null
  filters: TotalServiceFilterState
  drilldownPath: TotalServiceDrilldownNode[]
  drawer: TotalServiceDrawerState
}
