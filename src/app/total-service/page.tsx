"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import {
  Container,
  Box,
  Typography,
} from "@mui/material";

import PageHeader from "@/components/page-header";
import PageFilter from "@/components/page-filter";
import TrendChart from "@/components/trend-chart";
import MatrixTable from "@/components/matrix-table";
import { DetailTableModal } from "@/components/detail-table-modal";
import { DashboardLoading, DashboardError } from "@/components/dashboard-states";
import {
  TotalServicePovMode,
  TotalServiceMetricMode,
  TotalServiceGranularity,
} from "@/types/entities";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import {
  fetchTotalServiceSummary,
  fetchTotalServiceDetail,
  fetchNewGrowthSummary,
} from "@/services/api/vp-access-home";
import {
  adaptToChartSeries,
  adaptToMatrixRows,
  adaptTotalServiceDetailToModalRows,
  buildTimeBuckets,
  computeInitialPreviousValue,
  filterDetailByEntity,
} from "@/services/api/adapters";
import type { TrendChartPoint } from "@/components/trend-chart";
import type { TotalServiceV2MatrixRow } from "@/services/total-service";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

const DEFAULT_BRANCH_ID = '020';

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
  }>({
    isOpen: false,
    entityId: null,
    level: null,
    label: null,
    period: null,
  });

  const [detailRows, setDetailRows] = useState<EnrichedDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * Fetches summary data from the appropriate endpoint based on metricMode.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data: Record<string, unknown>[];

      if (metricMode === 'new_service') {
        data = await fetchNewGrowthSummary(year, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
      } else {
        data = await fetchTotalServiceSummary(year, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
      }

      setApiData(data);

      if (compareYear !== null) {
        let cmpData: Record<string, unknown>[];
        if (metricMode === 'new_service') {
          cmpData = await fetchNewGrowthSummary(compareYear, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
        } else {
          cmpData = await fetchTotalServiceSummary(compareYear, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
        }
        setCompareApiData(cmpData);
      } else {
        setCompareApiData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [year, compareYear, povMode, metricMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Determine which metric key to use based on metricMode
  const metricKey = useMemo(() => {
    if (metricMode === 'total_service') return 'total_active';
    if (metricMode === 'churn') return 'total_churn';
    if (metricMode === 'new_service') return 'total_new';
    return 'total_active';
  }, [metricMode]);

  // Transform API data to component-compatible formats
  const chartSeries = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToChartSeries(apiData, metricKey, year, compareApiData, granularity);
  }, [apiData, metricKey, year, compareApiData, granularity]);

  const initialPreviousValue = useMemo(() => {
    return computeInitialPreviousValue(apiData, metricKey, year);
  }, [apiData, metricKey, year]);

  const rows = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToMatrixRows(apiData, metricKey, povMode, year, compareApiData, granularity);
  }, [apiData, metricKey, povMode, year, compareApiData, granularity]);

  const buckets = useMemo(() => buildTimeBuckets(year, granularity), [year, granularity]);

  /**
   * Fetches detail data when modal opens.
   */
  const fetchDetailData = useCallback(async (period: string | null) => {
    setDetailLoading(true);
    try {
      let apiPeriod: string | undefined = undefined;
      if (period) {
        // Only convert if it looks like YYYY-MM format
        if (/^\d{4}-\d{2}$/.test(period)) {
          const parts = period.split('-');
          apiPeriod = parts[1] + parts[0].slice(2); // "2025-01" -> "0125"
        }
        // For Q1, H1, year keys — don't pass period, let backend handle with year
      }
      const detail = await fetchTotalServiceDetail(year, DEFAULT_BRANCH_ID, apiPeriod);
      let adapted = adaptTotalServiceDetailToModalRows(detail);
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
            <MatrixTable 
              rows={rows} 
              buckets={buckets} 
              valueType="number" 
              onLabelClick={(row, fullLabel) => {
                setDetailModal({
                  isOpen: true,
                  entityId: row.id,
                  level: row.level,
                  label: fullLabel,
                  period: null,
                });
              }}
              onCellClick={(row, bucketKey, fullLabel) => {
                setDetailModal({
                  isOpen: true,
                  entityId: row.id,
                  level: row.level,
                  label: fullLabel,
                  period: bucketKey,
                });
              }}
            />
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
