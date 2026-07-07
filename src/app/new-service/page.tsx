"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import {
  Container,
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
import { DetailTableModal } from "@/components/detail-table-modal";
import { DashboardLoading, DashboardError } from "@/components/dashboard-states";
import type { NewServiceTrendRow } from "@/services/new-service";
import {
  TotalServiceGranularity,
  TotalServicePovMode,
} from "@/types/entities";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import {
  fetchNewGrowthSummary,
  fetchNewGrowthDetail,
} from "@/services/api/vp-access-home";
import {
  adaptToChartSeries,
  adaptToMatrixRows,
  adaptToTrendMatrixRows,
  adaptNewGrowthDetailToModalRows,
  buildTimeBuckets,
  computeInitialPreviousValue,
  filterDetailByEntity,
} from "@/services/api/adapters";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

const DEFAULT_BRANCH_ID = '020';

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

  // API data states
  const [apiData, setApiData] = useState<Record<string, unknown>[]>([]);
  const [compareApiData, setCompareApiData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail modal state
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

  const [detailRows, setDetailRows] = useState<EnrichedDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * Fetches new growth summary data from API.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNewGrowthSummary(year, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
      setApiData(data);

      if (compareYear !== null) {
        const cmpData = await fetchNewGrowthSummary(compareYear, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
        setCompareApiData(cmpData);
      } else {
        setCompareApiData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [year, compareYear, povMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Transform API data to component-compatible formats
  const chartSeries = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToChartSeries(apiData, 'total_new', year, compareApiData, granularity);
  }, [apiData, year, compareApiData, granularity]);

  const initialPreviousValue = useMemo(() => {
    return computeInitialPreviousValue(apiData, 'total_new', year);
  }, [apiData, year]);

  const rows = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToMatrixRows(apiData, 'total_new', povMode, year, compareApiData, granularity);
  }, [apiData, povMode, year, compareApiData, granularity]);

  const trendRows = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToTrendMatrixRows(
      apiData as any[],
      povMode,
      year,
      granularity
    );
  }, [apiData, povMode, year, granularity]);

  const buckets = useMemo(() => buildTimeBuckets(year, granularity), [year, granularity]);

  /**
   * Fetches detail data when modal opens.
   */
  const fetchDetailData = useCallback(async (period: string | null) => {
    setDetailLoading(true);
    try {
      // Only pass period if it's YYYY-MM format; for Q1/H1/year keys, omit it
      let validPeriod: string | undefined = undefined;
      if (period && /^\d{4}-\d{2}$/.test(period)) {
        validPeriod = period;
      }
      const detail = await fetchNewGrowthDetail(year, DEFAULT_BRANCH_ID, validPeriod);
      let adapted = adaptNewGrowthDetailToModalRows(detail);
      // Filter by entity context
      adapted = filterDetailByEntity(adapted, detailModal.entityId, povMode);
      setDetailRows(adapted);
    } catch {
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  }, [year, detailModal.entityId, povMode]);

  useEffect(() => {
    if (detailModal.isOpen) {
      fetchDetailData(detailModal.period);
    }
  }, [detailModal.isOpen, detailModal.period, fetchDetailData]);

  const handleTrendLabelClick = (row: NewServiceTrendRow, fullLabel: string) => {
    const parts = row.id.split("::");
    const entityId = parts.length > 1 ? parts.slice(1).join("::") : null;
    const isPeriod = row.level === "period";

    setDetailModal({
      isOpen: true,
      entityId: entityId,
      level: isPeriod ? null : row.level as string,
      label: fullLabel,
      period: isPeriod ? row.id : parts[0],
      subMetricFilter: null,
    });
  };

  const handleTrendCellClick = (row: NewServiceTrendRow, metricKey: string, fullLabel: string) => {
    const parts = row.id.split("::");
    const entityId = parts.length > 1 ? parts.slice(1).join("::") : null;
    const isPeriod = row.level === "period";

    const metricLabel: Record<string, string> = {
      totalNewService: "Total Layanan Baru",
      homepaid: "Homepaid",
      homeconnect: "Homeconnect",
      block: "Blocked",
    };

    setDetailModal({
      isOpen: true,
      entityId: entityId,
      level: isPeriod ? null : row.level as string,
      label: `${fullLabel} — ${metricLabel[metricKey] ?? metricKey}`,
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
        
        {/* Page Header */}
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
                  backgroundColor: "#f1f5f9",
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

        {/* Content */}
        {loading ? (
          <DashboardLoading />
        ) : error ? (
          <DashboardError error={error} onRetry={fetchData} />
        ) : (
          <>
            {/* Dynamic Trend Chart Component */}
            <TrendChart
              series={chartSeries}
              valueType="number"
              year={year}
              compareYear={compareYear}
              initialPreviousValue={initialPreviousValue}
            />

            {/* Matrix Tree Breakdown Section */}
            <Box sx={{ mt: 4 }}>
              {displayMode === "performance" ? (
                <MatrixTable
                  rows={rows}
                  buckets={buckets}
                  valueType="number"
                  entityHeaderLabel={povMode === "sales" ? "Cabang" : "Cabang"}
                  onLabelClick={(row, fullLabel) => {
                    setDetailModal({
                      isOpen: true,
                      entityId: row.id,
                      level: row.level,
                      label: fullLabel,
                      period: null,
                      subMetricFilter: null,
                    });
                  }}
                  onCellClick={(row, bucketKey, fullLabel) => {
                    setDetailModal({
                      isOpen: true,
                      entityId: row.id,
                      level: row.level,
                      label: fullLabel,
                      period: bucketKey,
                      subMetricFilter: null,
                    });
                  }}
                />
              ) : (
                <TrendMatrixTable
                  rows={trendRows}
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
        rows={detailRows}
        title={`Detail ${detailModal.label || ""}${detailModal.period ? ` — ${
          (() => {
            if (/^\d{4}-\d{2}$/.test(detailModal.period)) {
              const [y, m] = detailModal.period.split('-');
              const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
              return `${months[parseInt(m, 10) - 1]} ${y}`;
            }
            return detailModal.period;
          })()
        }` : ""}`}
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
          <Typography variant="body1" color="text.secondary">Memuat dashboard...</Typography>
        </Container>
      </Box>
    }>
      <NewServiceDashboard />
    </Suspense>
  );
}
