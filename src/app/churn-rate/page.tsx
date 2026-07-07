"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import {
  Container,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Tooltip,
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
} from "@/services/api/vp-access-home";
import {
  adaptToChartSeries,
  adaptToMatrixRows,
  adaptTotalServiceDetailToModalRows,
  buildTimeBuckets,
  computeInitialPreviousValue,
  filterDetailByEntity,
} from "@/services/api/adapters";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

const DEFAULT_BRANCH_ID = '020';

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

  /**
   * Fetches churn data (total_churn from total-service summary).
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTotalServiceSummary(year, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
      setApiData(data);

      if (compareYear !== null) {
        const cmpData = await fetchTotalServiceSummary(compareYear, DEFAULT_BRANCH_ID, povMode) as unknown as Record<string, unknown>[];
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

  // Transform API data using 'total_churn' as the metric
  const chartSeries = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToChartSeries(apiData, 'total_churn', year, compareApiData, granularity);
  }, [apiData, year, compareApiData, granularity]);

  const initialPreviousValue = useMemo(() => {
    return computeInitialPreviousValue(apiData, 'total_churn', year);
  }, [apiData, year]);

  const rows = useMemo(() => {
    if (apiData.length === 0) return [];
    return adaptToMatrixRows(apiData, 'total_churn', povMode, year, compareApiData, granularity);
  }, [apiData, povMode, year, compareApiData, granularity]);

  const buckets = useMemo(() => buildTimeBuckets(year, granularity), [year, granularity]);

  /**
   * Fetches detail data when modal opens.
   */
  const fetchDetailData = useCallback(async (period: string | null) => {
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
    }
  }, [year, detailModal.entityId, povMode]);

  useEffect(() => {
    if (detailModal.isOpen) {
      fetchDetailData(detailModal.period);
    }
  }, [detailModal.isOpen, detailModal.period, fetchDetailData]);

  const TENURE_OPTIONS = [
    { value: "all",        label: "Semua" },
    { value: "lt_1_year", label: "< 1 tahun" },
    { value: "2_3_years", label: "2–3 tahun" },
    { value: "3_4_years", label: "3–4 tahun" },
    { value: "4_5_years", label: "4–5 tahun" },
    { value: "gt_5_year", label: "> 5 tahun" },
  ];

  // Tenure filter is kept for UI consistency but disabled since backend doesn't support it
  const tenureControl = (
    <Tooltip title="Filter tenure belum didukung oleh backend" arrow>
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <Select
          value={"all"}
          displayEmpty
          disabled
          sx={{
            height: "36px",
            borderRadius: "10px",
            fontWeight: 500,
            fontSize: "13px",
            color: "text.secondary",
            backgroundColor: "background.paper",
            opacity: 0.6,
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
    </Tooltip>
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
        
        {/* Page Header */}
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
              invertColors={true}
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
