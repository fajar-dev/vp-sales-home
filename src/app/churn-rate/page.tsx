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
} from "@/services/total-service";
import MatrixTable from "@/components/matrix-table";
import { DetailTableModal } from "@/components/detail-table-modal";
import {
  getServiceStartPeriods,
  filterSnapshotsByTenure,
  processDashboardData,
} from "@/services/churn-rate";
import {
  TotalServiceDashboardState,
  TotalServiceMetricMode,
  UserAccessScope,
} from "@/types/entities";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useSnapshots } from "@/hooks/use-snapshots";
import { useDetailRows } from "@/hooks/use-detail-rows";

const HEAD_OFFICE_ACCESS: UserAccessScope = {
  userId: "user-ho-001",
  fullName: "HO User",
  role: "head_office",
  organizationNodeId: "global",
  visibleNodeIds: [],
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

  // Fetch snapshots + org hierarchy from the reporting API.
  const yearsToFetch = useMemo(() => {
    const set = [year, year - 1];
    if (compareYear) set.push(compareYear);
    return set;
  }, [year, compareYear]);

  const { snapshots, nodes, loading, error } = useSnapshots(yearsToFetch);

  // Service start periods derived from the fetched window (tenure filtering).
  const serviceStartPeriods = useMemo(() => {
    return getServiceStartPeriods(snapshots);
  }, [snapshots]);

  // Filter snapshots based on tenure filter selection
  const filteredSnapshotsByTenure = useMemo(() => {
    return filterSnapshotsByTenure(snapshots, serviceStartPeriods, tenureFilter);
  }, [snapshots, serviceStartPeriods, tenureFilter]);

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
      nodes,
      access: HEAD_OFFICE_ACCESS,
      state: dashboardState,
    });
  }, [dashboardState, filteredSnapshotsByTenure, nodes]);

  // Transform monthly snapshots to churn values matching the monthly layout
  const dashboard = useMemo(() => {
    return processDashboardData(rawDashboard);
  }, [rawDashboard]);

  // Click-scoped churn detail straight from the API.
  const detailPeriods = useMemo(() => {
    if (!detailModal.isOpen) return [];
    if (detailModal.period) {
      const bucket = dashboard.buckets.find((b) => b.key === detailModal.period);
      return bucket ? bucket.periods : [detailModal.period];
    }
    return dashboard.buckets.flatMap((b) => b.periods);
  }, [detailModal, dashboard.buckets]);

  const { rows: enrichedRowsForModal, loading: detailLoading } = useDetailRows(
    "/api/detail",
    {
      type: "service",
      periods: detailPeriods.join(","),
      level: detailModal.level,
      entityId: detailModal.entityId,
      metric: "churn",
    },
    detailModal.isOpen,
  );

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
        
        {/* Data state banners */}
        {error && (
          <Box sx={{ p: 2, mb: 3, borderRadius: "12px", border: "1px solid #fecaca", backgroundColor: "#fef2f2" }}>
            <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
              Gagal memuat data dari database. Periksa koneksi/kredensial DB. ({error})
            </Typography>
          </Box>
        )}
        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Memuat data dari database...
          </Typography>
        )}

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
        loading={detailLoading}
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
