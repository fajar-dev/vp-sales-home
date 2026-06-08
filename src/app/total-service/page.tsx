"use client";

import React, { useMemo, useState, Suspense } from "react";
import {
  Container,
  Paper,
  Box,
  Typography,
  Stack,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import PageHeader from "@/components/page-header";
import PageFilter from "@/components/page-filter";
import TrendChart from "@/components/trend-chart";
import {
  buildTotalServiceV2DashboardData,
  TotalServiceV2MatrixRow,
  TotalServiceV2MatrixCell,
  getEnrichedRowsForModal,
} from "@/services/total-service";
import MatrixTable from "@/components/matrix-table";
import { DetailTableModal } from "@/components/detail-table-modal";
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

function TotalServiceDashboard() {
  const {
    year,
    compareYear,
    povMode,
    granularity,
    metricMode: metricModeRaw,
    setYear,
    setCompareYear,
    setPovMode,
    setGranularity,
    setMetricMode,
  } = useDashboardFilters();

  const metricMode = (metricModeRaw || "total_service") as TotalServiceMetricMode;

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

  // Track open/collapsed row IDs in our tree matrix

  // 2. Build Dashboard State dynamically
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

  // 3. Process Snapshots through the V2 Aggregation Engine
  const dashboard = useMemo(() => {
    return buildTotalServiceV2DashboardData({
      snapshots: MOCK_SNAPSHOTS,
      nodes: MOCK_ORGANIZATION_NODES,
      access: MOCK_ACCESS,
      state: dashboardState,
    });
  }, [dashboardState]);

  const enrichedRowsForModal = useMemo(() => {
    return getEnrichedRowsForModal({
      detailModal,
      year,
      buckets: dashboard.buckets,
      metricMode,
      snapshots: MOCK_SNAPSHOTS,
      organizationNodes: MOCK_ORGANIZATION_NODES,
    });
  }, [detailModal, year, dashboard.buckets, metricMode]);

  // 4. (Removed local flattenedRows logic)

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
            title="Layanan Aktif"
            subtitle="Pantau layanan aktif, tren, rincian hierarki, dan performa kelompok layanan."
          />
        </Box>
        <Box sx={{ mb: 4 }}>
          <PageFilter
            year={year}
            compareYear={compareYear}
            onCompareYearChange={setCompareYear}
            povMode={povMode}
            metricMode={metricMode}
            metricOptions={[
              { value: "total_service", label: "Layanan Aktif" },
              { value: "new_service", label: "Pertumbuhan Baru" },
              { value: "churn", label: "Churn" },
            ]}
            showPov={true}
            granularity={granularity}
            onYearChange={setYear}
            onPovChange={setPovMode}
            onMetricChange={(m) => setMetricMode(m as TotalServiceMetricMode)}
            onGranularityChange={setGranularity}
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

        {/* Collapsible Integrity Warnings Details panel */}
        {dashboard.warnings.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: "16px",
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mb: 2 }}
            >
              <WarningAmberIcon sx={{ color: "error.main" }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "text.primary" }}>
                Detail Peringatan Integritas Data ({dashboard.warnings.length})
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {dashboard.warnings.map((warning, idx: number) => (
                <Box
                  key={idx}
                  sx={{
                    p: 1.5,
                    borderRadius: "8px",
                    backgroundColor: warning.severity === "error" ? "#fef2f2" : "#fffbeb",
                    border: "1px solid",
                    borderColor: warning.severity === "error" ? "#fecaca" : "#fef3c7",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: warning.severity === "error" ? "error.main" : "warning.main",
                    }}
                  >
                    [{warning.code}] {warning.message}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        )}

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

export default function TotalServiceDashboardPage() {
  return (
    <Suspense fallback={
      <Box sx={{ p: "1.5rem", backgroundColor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="xl">
          <Typography variant="body1" color="text.secondary">Memuat dashboard...</Typography>
        </Container>
      </Box>
    }>
      <TotalServiceDashboard />
    </Suspense>
  );
}
