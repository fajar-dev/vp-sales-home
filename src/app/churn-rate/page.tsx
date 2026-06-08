"use client";

import React, { useMemo, useState, Suspense } from "react";
import {
  Container,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
} from "@mui/material";

import PageHeader from "@/components/page-header";
import PageFilter from "@/components/page-filter";
import TrendChart from "@/components/trend-chart";
import {
  buildTotalServiceV2DashboardData,
  TotalServiceV2MatrixRow,
  TotalServiceV2MatrixCell,
} from "@/services/total-service";
import MatrixTable from "@/components/matrix-table";
import { DetailTableModal } from "@/components/detail-table-modal";
import {
  getServiceStartPeriods,
  filterSnapshotsByTenure,
  processDashboardData,
  getEnrichedRowsForModal,
} from "@/services/churn-rate";
import { MOCK_SNAPSHOTS, MOCK_ORGANIZATION_NODES } from "@/services/mock/customers-services";
import {
  TotalServiceDashboardState,
  TotalServicePovMode,
  TotalServiceMetricMode,
  TotalServiceGranularity,
  UserAccessScope,
} from "@/types/entities";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";

const MOCK_ACCESS: UserAccessScope = {
  userId: "user-ho-001",
  fullName: "HO User",
  role: "head_office",
  organizationNodeId: "global",
  visibleNodeIds: ["branch-medan", "branch-pekanbaru"],
  defaultReportScope: "head_office",
  isActive: true,
};

function ChurnRateDashboard() {
  const {
    year,
    compareYear,
    povMode,
    granularity,
    metricMode: metricModeRaw,
    tenureFilter,
    setYear,
    setCompareYear,
    setPovMode,
    setGranularity,
    setMetricMode,
    setTenureFilter,
  } = useDashboardFilters();

  const metricMode = (metricModeRaw || "churn") as TotalServiceMetricMode;

  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    entityId: string | null;
    level: string | null;
    label: string | null;
    period: string | null;
  }>({
    isOpen: false,
    entityId: null,
    level: null,
    label: null,
    period: null,
  });

  // Mappings of service start dates, with simulated historic start periods
  const serviceStartPeriods = useMemo(() => {
    return getServiceStartPeriods(MOCK_SNAPSHOTS);
  }, []);

  // Filter snapshots based on tenure filter selection
  const filteredSnapshotsByTenure = useMemo(() => {
    return filterSnapshotsByTenure(MOCK_SNAPSHOTS, serviceStartPeriods, tenureFilter);
  }, [tenureFilter, serviceStartPeriods]);

  const dashboardState = useMemo<TotalServiceDashboardState>(() => {
    return {
      year,
      compareYear,
      povMode,
      metricMode,
      granularity,
      drilldownPath: [],
      filters: {
        branchId: null,
        leadId: null,
        amId: null,
        serviceGroup: null,
        includePartialData: true,
      },
      drawer: {
        isOpen: false,
        section: null,
      },
    };
  }, [year, compareYear, povMode, metricMode, granularity]);

  const rawDashboard = useMemo(() => {
    return buildTotalServiceV2DashboardData({
      snapshots: filteredSnapshotsByTenure,
      nodes: MOCK_ORGANIZATION_NODES,
      access: MOCK_ACCESS,
      state: dashboardState,
    });
  }, [dashboardState, filteredSnapshotsByTenure]);

  // Transform monthly snapshots to churn values matching the monthly layout
  const dashboard = useMemo(() => {
    return processDashboardData(rawDashboard);
  }, [rawDashboard]);

  const enrichedRowsForModal = useMemo(() => {
    return getEnrichedRowsForModal({
      detailModal,
      year,
      buckets: dashboard.buckets,
      metricMode,
      snapshots: filteredSnapshotsByTenure,
      organizationNodes: MOCK_ORGANIZATION_NODES,
    });
  }, [detailModal, year, dashboard.buckets, metricMode, filteredSnapshotsByTenure]);

  const TENURE_OPTIONS = [
    { value: "all",        label: "Semua" },
    { value: "lt_1_year", label: "< 1 tahun" },
    { value: "2_3_years", label: "2–3 tahun" },
    { value: "3_4_years", label: "3–4 tahun" },
    { value: "4_5_years", label: "4–5 tahun" },
    { value: "gt_5_year", label: "> 5 tahun" },
  ];

  const tenureControl = (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <Select
        value={tenureFilter}
        displayEmpty
        onChange={(e) => setTenureFilter(e.target.value)}
        sx={{
          height: "36px",
          borderRadius: "10px",
          fontWeight: 500,
          fontSize: "13px",
          color: "text.primary",
          backgroundColor: "background.paper",
          "& .MuiSelect-select": { py: 0.8, px: 1.5 },
        }}
      >
        {TENURE_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: "13px", fontWeight: 500 }}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box
      sx={{
        backgroundColor: "background.default",
        minHeight: "100vh",
        p: "1.5rem",
      }}
    >
      <Container maxWidth="xl">
        
        {/* Decoupled PageHeader and PageFilter Components */}
        <Box sx={{ mb: 2 }}>
          <PageHeader
            title="Tingkat Churn"
            subtitle="Pantau layanan yang churn, tren pemutusan, rincian hierarki, dan upaya pencegahan churn."
          />
        </Box>
        <Box sx={{ mb: 4 }}>
          <PageFilter
            year={year}
            compareYear={compareYear}
            onCompareYearChange={setCompareYear}
            povMode={povMode}
            showPov={true}
            granularity={granularity}
            onYearChange={setYear}
            onPovChange={setPovMode}
            onGranularityChange={setGranularity}
            extraControls={tenureControl}
          />
        </Box>
        
        {/* Dynamic Trend Chart Component */}
        <TrendChart
          series={dashboard.chartSeries}
          valueType="number"
          year={year}
          compareYear={compareYear}
          initialPreviousValue={dashboard.initialPreviousValue}
        />

        {/* Matrix Tree Breakdown Section */}
        <MatrixTable 
          rows={dashboard.rows} 
          buckets={dashboard.buckets} 
          valueType="number" 
          invertColors={true}
          onLabelClick={(row) => {
            setDetailModal({
              isOpen: true,
              entityId: row.id,
              level: row.level,
              label: row.label,
              period: null,
            });
          }}
          onCellClick={(row, bucketKey) => {
            setDetailModal({
              isOpen: true,
              entityId: row.id,
              level: row.level,
              label: row.label,
              period: bucketKey,
            });
          }}
        />

      </Container>

      <DetailTableModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
        rows={enrichedRowsForModal}
        title={`Detail ${detailModal.label || ""}`}
        showBandwidth={false}
        showRevenue={false}
        metricMode={metricMode}
      />
    </Box>
  );
}

export default function ChurnRateDashboardPage() {
  return (
    <Suspense fallback={
      <Box sx={{ p: "1.5rem", backgroundColor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="xl">
          <Typography variant="body1" color="text.secondary">Memuat dashboard...</Typography>
        </Container>
      </Box>
    }>
      <ChurnRateDashboard />
    </Suspense>
  );
}
