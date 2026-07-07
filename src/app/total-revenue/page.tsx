"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import PageHeader from "@/components/page-header";
import PageFilter from "@/components/page-filter";
import TrendChart from "@/components/trend-chart";
import MatrixTable from "@/components/matrix-table";
import { DetailTableModal } from "@/components/detail-table-modal";
import { DashboardLoading, DashboardError } from "@/components/dashboard-states";
import {
  TotalServicePovMode,
  TotalServiceGranularity,
} from "@/types/entities";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import {
  fetchRevenueSummary,
  fetchRevenueHomepaid,
  fetchBillingSummary,
  fetchRevenueTotal,
  fetchRevenueDetail,
} from "@/services/api/vp-access-home";
import type {
  RevenueSummaryRow,
  BillingSummary,
  RevenueTotal,
} from "@/services/api/vp-access-home";
import {
  adaptRevenueToChartSeries,
  adaptRevenueToMatrixRows,
  adaptRevenueDetailToModalRows,
  buildTimeBuckets,
  filterDetailByEntity,
} from "@/services/api/adapters";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

const DEFAULT_BRANCH_ID = '020';

/**
 * Helper function to format IDR elegantly with dots
 */
function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function TotalRevenueDashboard() {
  const {
    year,
    compareYear,
    povMode,
    granularity,
    setYear,
    setCompareYear,
    setPovMode,
    setGranularity,
  } = useDashboardFilters();

  // API data states
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummaryRow[]>([]);
  const [homepaidData, setHomepaidData] = useState<RevenueSummaryRow[]>([]);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [revenueTotal, setRevenueTotal] = useState<RevenueTotal | null>(null);
  const [compareRevenueSummary, setCompareRevenueSummary] = useState<RevenueSummaryRow[] | null>(null);
  const [compareHomepaidData, setCompareHomepaidData] = useState<RevenueSummaryRow[] | null>(null);
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

  const comparisonYear = compareYear !== null ? compareYear : (year - 1);

  /**
   * Fetches all revenue data from multiple endpoints.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, homepaid, billing, total] = await Promise.all([
        fetchRevenueSummary(year, DEFAULT_BRANCH_ID),
        fetchRevenueHomepaid(year, DEFAULT_BRANCH_ID),
        fetchBillingSummary(year, DEFAULT_BRANCH_ID),
        fetchRevenueTotal(year, DEFAULT_BRANCH_ID),
      ]);

      setRevenueSummary(summary);
      setHomepaidData(homepaid);
      setBillingSummary(billing);
      setRevenueTotal(total);

      // Fetch comparison year data
      const [cmpSummary, cmpHomepaid] = await Promise.all([
        fetchRevenueSummary(comparisonYear, DEFAULT_BRANCH_ID),
        fetchRevenueHomepaid(comparisonYear, DEFAULT_BRANCH_ID),
      ]);
      setCompareRevenueSummary(cmpSummary);
      setCompareHomepaidData(cmpHomepaid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [year, comparisonYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute headline totals
  const totalHomepaidRevenue = useMemo(() => {
    return homepaidData.reduce((sum, r) => sum + r.total, 0);
  }, [homepaidData]);

  const totalRevenue = useMemo(() => {
    return revenueTotal?.total ?? 0;
  }, [revenueTotal]);

  const totalHomeconnectRevenue = useMemo(() => {
    return revenueSummary.reduce((sum, r) => sum + r.total, 0);
  }, [revenueSummary]);

  const previousHomepaidRevenue = useMemo(() => {
    return (compareHomepaidData ?? []).reduce((sum, r) => sum + r.total, 0);
  }, [compareHomepaidData]);

  const previousHomeconnectRevenue = useMemo(() => {
    return (compareRevenueSummary ?? []).reduce((sum, r) => sum + r.total, 0);
  }, [compareRevenueSummary]);

  const deltaHomepaid = totalHomepaidRevenue - previousHomepaidRevenue;
  const deltaHomepaidPct = previousHomepaidRevenue === 0 ? 0 : Math.round((deltaHomepaid / previousHomepaidRevenue) * 100);

  const deltaHomeconnect = totalHomeconnectRevenue - previousHomeconnectRevenue;
  const deltaHomeconnectPct = previousHomeconnectRevenue === 0 ? 0 : Math.round((deltaHomeconnect / previousHomeconnectRevenue) * 100);

  const revenueGap = totalHomeconnectRevenue - totalHomepaidRevenue;
  const previousRevenueGap = previousHomeconnectRevenue - previousHomepaidRevenue;
  const deltaRevenueGap = revenueGap - previousRevenueGap;

  const homepaidPct = billingSummary && billingSummary.total_all > 0
    ? Math.round((billingSummary.total_paid / billingSummary.total_all) * 100)
    : 0;

  // Chart series
  const chartSeries = useMemo(() => {
    if (revenueSummary.length === 0) return [];
    return adaptRevenueToChartSeries(
      revenueSummary,
      year,
      compareYear !== null ? compareRevenueSummary : null,
      granularity
    );
  }, [revenueSummary, year, compareYear, compareRevenueSummary, granularity]);

  // Matrix rows
  const matrixRows = useMemo(() => {
    if (revenueSummary.length === 0) return [];
    return adaptRevenueToMatrixRows(
      revenueSummary,
      year,
      compareYear !== null ? compareRevenueSummary : null,
      granularity
    );
  }, [revenueSummary, year, compareYear, compareRevenueSummary, granularity]);

  const buckets = useMemo(() => buildTimeBuckets(year, granularity), [year, granularity]);

  /**
   * Fetches detail data when modal opens.
   */
  const fetchDetailData = useCallback(async (period: string | null) => {
    try {
      // Only pass period if it's YYYY-MM format; for Q1/H1/year keys, omit it
      let validPeriod: string | undefined = undefined;
      if (period && /^\d{4}-\d{2}$/.test(period)) {
        validPeriod = period;
      }
      const detail = await fetchRevenueDetail(year, DEFAULT_BRANCH_ID, validPeriod);
      let adapted = adaptRevenueDetailToModalRows(detail);
      // Filter by entity context (revenue is branch-only, so single-part entityId works)
      adapted = filterDetailByEntity(adapted, detailModal.entityId, 'operational');
      setDetailRows(adapted);
    } catch {
      setDetailRows([]);
    }
  }, [year, detailModal.entityId]);

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
            title="Total Pendapatan"
            subtitle="Pantau pendapatan aktual dan proyeksi di seluruh hierarki, bandingkan periode, dan sorot kesenjangan monetisasi."
          />
        </Box>
        <Box sx={{ mb: 4 }}>
          <PageFilter
            year={year}
            compareYear={compareYear}
            onCompareYearChange={setCompareYear}
            povMode={povMode}
            metricMode=""
            metricOptions={[]}
            showPov={true}
            granularity={granularity}
            onYearChange={setYear}
            onPovChange={setPovMode}
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
            {/* Dynamic Summary Cards Row */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(5, 1fr)",
                },
                gap: 2,
                mb: 4,
              }}
            >
              {/* Card 1: Total Revenue */}
              <Card
                elevation={0}
                sx={{
                  borderRadius: "16px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Total Pendapatan
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                    {formatRupiah(totalRevenue)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Pendapatan terealisasi berdasarkan pembayaran
                  </Typography>
                </CardContent>
              </Card>

              {/* Card 2: Homepaid Revenue */}
              <Card
                elevation={0}
                sx={{
                  borderRadius: "16px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Homepaid Revenue
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                    {formatRupiah(totalHomepaidRevenue)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Pendapatan aktual dari layanan berbayar
                  </Typography>
                  <Chip
                    label={`${deltaHomepaidPct >= 0 ? "+" : ""}${deltaHomepaidPct}% vs ${comparisonYear}`}
                    size="small"
                    sx={{
                      mt: 1.5,
                      fontWeight: 600,
                      fontSize: "11px",
                      bgcolor: (theme) => alpha(theme.palette[deltaHomepaidPct >= 0 ? "success" : "error"].main, 0.12),
                      color: (theme) => theme.palette[deltaHomepaidPct >= 0 ? "success" : "error"].dark,
                    }}
                  />
                </CardContent>
              </Card>

              {/* Card 3: Rasio Pembayaran */}
              <Card
                elevation={0}
                sx={{
                  borderRadius: "16px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Rasio Pembayaran
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                    {homepaidPct}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    {billingSummary ? `${billingSummary.total_paid.toLocaleString('id-ID')} / ${billingSummary.total_all.toLocaleString('id-ID')} tagihan terbayar` : '-'}
                  </Typography>
                </CardContent>
              </Card>

              {/* Card 4: Revenue Gap */}
              <Card
                elevation={0}
                sx={{
                  borderRadius: "16px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Kesenjangan Pendapatan
                  </Typography>
                  <Typography
                    variant="h4"
                    onClick={() => {
                      setDetailModal({
                        isOpen: true,
                        entityId: "revenue_gap",
                        level: "revenue_gap",
                        label: `Kesenjangan Pendapatan (Tidak Dibayar) - Tahun ${year}`,
                        period: null,
                      });
                    }}
                    sx={{
                      fontWeight: 700,
                      mt: 1,
                      mb: 0.5,
                      color: "error.main",
                      textDecoration: "underline",
                      cursor: "pointer",
                      "&:hover": {
                        color: "error.dark",
                      }
                    }}
                  >
                    {formatRupiah(revenueGap)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Proyeksi dikurangi pendapatan aktual
                  </Typography>
                  <Chip
                    label={`${deltaRevenueGap >= 0 ? "+" : ""}${formatRupiah(deltaRevenueGap)} vs ${comparisonYear}`}
                    size="small"
                    sx={{
                      mt: 1.5,
                      fontWeight: 600,
                      fontSize: "11px",
                      bgcolor: (theme) => alpha(theme.palette[deltaRevenueGap >= 0 ? "error" : "success"].main, 0.12),
                      color: (theme) => theme.palette[deltaRevenueGap >= 0 ? "error" : "success"].dark,
                    }}
                  />
                </CardContent>
              </Card>

              {/* Card 5: Homeconnect Revenue */}
              <Card
                elevation={0}
                sx={{
                  borderRadius: "16px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Homeconnect Revenue
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                    {formatRupiah(totalHomeconnectRevenue)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Proyeksi pendapatan dari layanan terkoneksi
                  </Typography>
                  <Chip
                    label={`${deltaHomeconnectPct >= 0 ? "+" : ""}${deltaHomeconnectPct}% vs ${comparisonYear}`}
                    size="small"
                    sx={{
                      mt: 1.5,
                      fontWeight: 600,
                      fontSize: "11px",
                      bgcolor: (theme) => alpha(theme.palette[deltaHomeconnectPct >= 0 ? "success" : "error"].main, 0.12),
                      color: (theme) => theme.palette[deltaHomeconnectPct >= 0 ? "success" : "error"].dark,
                    }}
                  />
                </CardContent>
              </Card>
            </Box>

            {/* Dynamic Trend Chart Component */}
            <TrendChart
              series={chartSeries}
              valueType="currency"
              year={year}
              compareYear={compareYear}
            />

            {/* Matrix Tree Breakdown Section */}
            <MatrixTable 
              rows={matrixRows} 
              buckets={buckets} 
              valueType="currency" 
              columnWidth="12rem"
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
        title={detailModal.level === "revenue_gap" ? "Detail Kesenjangan Pendapatan (Tidak Dibayar)" : `Detail Pendapatan ${detailModal.label || ""}${detailModal.period ? ` — ${
          (() => {
            if (/^\d{4}-\d{2}$/.test(detailModal.period)) {
              const [y, m] = detailModal.period.split('-');
              const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
              return `${months[parseInt(m, 10) - 1]} ${y}`;
            }
            return detailModal.period;
          })()
        }` : ""}`}
        showRevenue={true}
        showBandwidth={false}
        metricMode="revenue_gap"
      />
    </Box>
  );
}

export default function TotalRevenueDashboardPage() {
  return (
    <Suspense fallback={
      <Box sx={{ p: "1.5rem", backgroundColor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="xl">
          <Typography variant="body1" color="text.secondary">Memuat dashboard...</Typography>
        </Container>
      </Box>
    }>
      <TotalRevenueDashboard />
    </Suspense>
  );
}
