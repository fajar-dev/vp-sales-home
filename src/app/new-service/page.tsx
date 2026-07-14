"use client";

import React, { useMemo, useState, Suspense } from "react";
import {
  Container,
  Paper,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";

import PageHeader from "@/components/page-header";
import PageFilter from "@/components/page-filter";
import TrendChart from "@/components/trend-chart";
import MatrixTable from "@/components/matrix-table";
import TrendMatrixTable from "@/components/trend-matrix-table";
import LoadingState from "@/components/loading-state";
import { DetailTableModal } from "@/components/detail-table-modal";
import {
  buildNewServiceDashboardData,
  NewServiceDashboardState,
  NewServiceTrendRow,
} from "@/services/new-service";
import {
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

function NewServiceDashboard() {
  const {
    year,
    compareYear,
    povMode,
    granularity,
    displayMode: displayModeRaw,
    setYear,
    setCompareYear,
    setPovMode,
    setGranularity,
    setDisplayMode,
  } = useDashboardFilters();

  const displayMode = (displayModeRaw || "trend") as "performance" | "trend";

  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    entityId: string | null;
    level: string | null;
    label: string | null;
    period: string | null;
    subMetricFilter: string | null;
  }>({
    isOpen: false,
    entityId: null,
    level: null,
    label: null,
    period: null,
    subMetricFilter: null,
  });

  const dashboardState = useMemo<NewServiceDashboardState>(() => {
    return {
      year,
      compareYear,
      povMode,
      displayMode,
      granularity,
      drilldownPath: [],
      filters: {
        branchId: null,
        leadId: null,
        amId: null,
        serviceGroup: null,
        includePartialData: true,
      },
    };
  }, [year, compareYear, povMode, displayMode, granularity]);

  // Fetch snapshots + org hierarchy from the reporting API.
  const yearsToFetch = useMemo(() => {
    const set = [year, year - 1];
    if (compareYear) set.push(compareYear);
    return set;
  }, [year, compareYear]);

  const { snapshots, nodes, loading, error } = useSnapshots(yearsToFetch);

  const dashboard = useMemo(() => {
    return buildNewServiceDashboardData({
      snapshots,
      nodes,
      access: HEAD_OFFICE_ACCESS,
      state: dashboardState,
    });
  }, [dashboardState, snapshots, nodes]);

  // Click-scoped "new service" detail straight from the API.
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
      type: "new_service",
      periods: detailPeriods.join(","),
      level: detailModal.level,
      entityId: detailModal.entityId,
      subMetric: detailModal.subMetricFilter,
    },
    detailModal.isOpen,
  );

  const handleTrendLabelClick = (row: NewServiceTrendRow) => {
    const parts = row.id.split("::");
    const entityId = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const isPeriod = row.level === "period";

    setDetailModal({
      isOpen: true,
      entityId: isPeriod ? null : entityId,
      level: isPeriod ? null : row.level as string,
      label: row.label,
      period: isPeriod ? row.id : parts[0],
      subMetricFilter: null,
    });
  };

  const handleTrendCellClick = (row: NewServiceTrendRow, metricKey: string) => {
    const parts = row.id.split("::");
    const entityId = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const isPeriod = row.level === "period";

    const metricLabel: Record<string, string> = {
      totalNewService: "Total Layanan Baru",
      homepaid: "Homepaid",
      homeconnect: "Homeconnect",
      block: "Blocked",
    };

    setDetailModal({
      isOpen: true,
      entityId: isPeriod ? null : entityId,
      level: isPeriod ? null : row.level as string,
      label: `${row.label} — ${metricLabel[metricKey] ?? metricKey}`,
      period: isPeriod ? row.id : parts[0],
      subMetricFilter: metricKey !== "totalNewService" ? metricKey : null,
    });
  };

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
            title="Layanan Baru"
            subtitle="Pantau layanan baru, corong registrasi-koneksi-pembayaran, dan performa kelompok layanan."
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
            metricOptions={[]}
            extraControls={
              <ToggleButtonGroup
                value={displayMode}
                exclusive
                onChange={(_, value) => value && setDisplayMode(value)}
                aria-label="display mode"
                size="small"
                sx={{
                  height: "36px",
                  borderRadius: "12px",
                  backgroundColor: "#f1f5f9", // Slate 100
                  border: "none",
                  p: "3px",
                }}
              >
                <ToggleButton
                  value="performance"
                  aria-label="performance view"
                  sx={{
                    fontSize: "13px",
                    fontWeight: displayMode === "performance" ? 600 : 500,
                    px: 2.5,
                    borderRadius: "9px !important",
                    color: displayMode === "performance" ? "#0f172a" : "#64748b",
                    backgroundColor: displayMode === "performance" ? "#ffffff" : "transparent",
                    "&.Mui-selected": {
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                    },
                  }}
                >
                  Performa
                </ToggleButton>
                <ToggleButton
                  value="trend"
                  aria-label="trend view"
                  sx={{
                    fontSize: "13px",
                    fontWeight: displayMode === "trend" ? 600 : 500,
                    px: 2.5,
                    borderRadius: "9px !important",
                    color: displayMode === "trend" ? "#0f172a" : "#64748b",
                    backgroundColor: displayMode === "trend" ? "#ffffff" : "transparent",
                    "&.Mui-selected": {
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                    },
                  }}
                >
                  Tren
                </ToggleButton>
              </ToggleButtonGroup>
            }
          />
        </Box>

        {/* Data state banners */}
        {error && (
          <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: "12px", border: "1px solid", borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
            <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
              Gagal memuat data dari database. Periksa koneksi/kredensial DB. ({error})
            </Typography>
          </Paper>
        )}

        {loading ? (
          <LoadingState label="Memuat Data" />
        ) : (
          <>
            {/* Dynamic Trend Chart Component */}
            <TrendChart
              series={dashboard.chartSeries}
              valueType="number"
              year={year}
              compareYear={compareYear}
              initialPreviousValue={dashboard.initialPreviousValue}
            />

            {/* Matrix Tree Breakdown Section */}
            <Box sx={{ mt: 4 }}>
              {displayMode === "performance" ? (
                <MatrixTable
                  rows={dashboard.rows}
                  buckets={dashboard.buckets}
                  valueType="number"
                  entityHeaderLabel={povMode === "sales" ? "Cabang" : "Cabang"}
                  onLabelClick={(row) => {
                    setDetailModal({
                      isOpen: true,
                      entityId: row.id,
                      level: row.level,
                      label: row.label,
                      period: null,
                      subMetricFilter: null,
                    });
                  }}
                  onCellClick={(row, bucketKey) => {
                    setDetailModal({
                      isOpen: true,
                      entityId: row.id,
                      level: row.level,
                      label: row.label,
                      period: bucketKey,
                      subMetricFilter: null,
                    });
                  }}
                />
              ) : (
                <TrendMatrixTable
                  rows={dashboard.trendRows}
                  onLabelClick={handleTrendLabelClick}
                  onCellClick={handleTrendCellClick}
                />
              )}
            </Box>
          </>
        )}

      </Container>

      <DetailTableModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
        rows={enrichedRowsForModal}
        loading={detailLoading}
        title={`Detail ${detailModal.label || ""}`}
        showBandwidth={false}
      />
    </Box>
  );
}

export default function NewServiceDashboardPage() {
  return (
    <Suspense fallback={
      <Box sx={{ p: "1.5rem", backgroundColor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="xl">
          <LoadingState label="Memuat Data" minHeight="30rem" />
        </Container>
      </Box>
    }>
      <NewServiceDashboard />
    </Suspense>
  );
}
