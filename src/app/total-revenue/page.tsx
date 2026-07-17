"use client";

import React, { useMemo, useState, Suspense } from "react";
import {
  Container,
  Paper,
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
import LoadingState from "@/components/loading-state";
import { DetailTableModal } from "@/components/detail-table-modal";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDetailRows } from "@/hooks/use-detail-rows";
import { useRevenueSnapshots } from "@/hooks/use-revenue-snapshots";
import {
  formatRupiah,
  buildTimeBuckets,
  getMetricValueForBucket,
  buildRevenueRows,
} from "@/services/total-revenue";
import { levelLabelId, periodLabelId } from "@/lib/detail-context";

// V2 expected/actual revenue aggregation implementation
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

  // 1. Build dynamic periods (months, quarters, semesters, years)
  const timeBuckets = useMemo(() => {
    return buildTimeBuckets(granularity, year);
  }, [granularity, year]);

  // Previous year ending baseline bucket for delta calculations
  const baselinePeriods = useMemo(() => {
    return [`${year - 1}-12`];
  }, [year]);

  // Fetch revenue-grain snapshots (expected/actual) from the API.
  const yearsToFetch = useMemo(() => {
    const set = [year, year - 1];
    if (compareYear) set.push(compareYear);
    return set;
  }, [year, compareYear]);

  const { snapshots: scopedSnapshots, nodes, loading, error } =
    useRevenueSnapshots(yearsToFetch);

  const metricType = "expected";

  const rows = useMemo(() => {
    return buildRevenueRows(scopedSnapshots, timeBuckets, baselinePeriods, compareYear, nodes, metricType, "branch", null, povMode);
  }, [scopedSnapshots, timeBuckets, baselinePeriods, compareYear, nodes, povMode]);

  // Click-scoped revenue detail straight from the API.
  const detailPeriods = useMemo(() => {
    if (!detailModal.isOpen) return [];
    if (detailModal.period) {
      const bucket = timeBuckets.find((b) => b.key === detailModal.period);
      return bucket ? bucket.periods : [detailModal.period];
    }
    return timeBuckets.flatMap((b) => b.periods);
  }, [detailModal, timeBuckets]);

  // Revenue-gap opens list unpaid lines for the selected year only.
  const gapPeriods = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`),
    [year],
  );

  const { rows: enrichedRowsForModal, loading: detailLoading } = useDetailRows(
    "/api/detail",
    {
      type: "revenue",
      periods:
        detailModal.level === "revenue_gap"
          ? gapPeriods.join(",")
          : detailPeriods.join(","),
      level: detailModal.level,
      entityId: detailModal.entityId,
      unpaid: detailModal.level === "revenue_gap" ? "1" : null,
    },
    detailModal.isOpen,
  );

  const detailContext = {
    metricLabel: detailModal.level === "revenue_gap" ? "Kesenjangan Pendapatan" : "Pendapatan",
    levelLabel: detailModal.level === "revenue_gap" ? null : levelLabelId(detailModal.level),
    entityLabel: detailModal.level === "revenue_gap" ? null : detailModal.label,
    periodLabel:
      detailModal.level === "revenue_gap"
        ? `Semua bulan ${year}`
        : periodLabelId(detailModal.period, year),
    extraLabel: detailModal.level === "revenue_gap" ? "Hanya tagihan belum dibayar" : null,
  };

  // Comparison year time buckets for annual comparison calculations
  const comparisonYear = compareYear !== null ? compareYear : (year - 1);

  const comparisonYearTimeBuckets = useMemo(() => {
    return buildTimeBuckets(granularity, comparisonYear);
  }, [granularity, comparisonYear]);

  // Compute headline totals aggregated across all period buckets
  const totalExpectedRevenue = useMemo(() => {
    return timeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, "expected"), 0);
  }, [scopedSnapshots, timeBuckets]);

  const totalActualRevenue = useMemo(() => {
    return timeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, "actual"), 0);
  }, [scopedSnapshots, timeBuckets]);

  const previousExpectedRevenue = useMemo(() => {
    return comparisonYearTimeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, "expected"), 0);
  }, [scopedSnapshots, comparisonYearTimeBuckets]);

  const previousActualRevenue = useMemo(() => {
    return comparisonYearTimeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, "actual"), 0);
  }, [scopedSnapshots, comparisonYearTimeBuckets]);

  const currentMetricTotal = useMemo(() => {
    return timeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, metricType), 0);
  }, [scopedSnapshots, timeBuckets]);

  const previousMetricTotal = useMemo(() => {
    return comparisonYearTimeBuckets.reduce((sum, bucket) => sum + getMetricValueForBucket(scopedSnapshots, bucket.periods, metricType), 0);
  }, [scopedSnapshots, comparisonYearTimeBuckets]);

  const deltaMetric = currentMetricTotal - previousMetricTotal;
  const deltaMetricPercentage = previousMetricTotal === 0 ? 0 : Math.round((deltaMetric / previousMetricTotal) * 100);

  const deltaActualRevenue = totalActualRevenue - previousActualRevenue;

  const deltaExpectedRevenue = totalExpectedRevenue - previousExpectedRevenue;
  const deltaExpectedPercentage = previousExpectedRevenue === 0 ? 0 : Math.round((deltaExpectedRevenue / previousExpectedRevenue) * 100);

  const revenueGap = totalExpectedRevenue - totalActualRevenue;
  const previousRevenueGap = previousExpectedRevenue - previousActualRevenue;
  const deltaRevenueGap = revenueGap - previousRevenueGap;



  // Trend Chart will handle its own height and max value

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

        {/* Data state banners */}
        {error && (
          <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: "12px", border: "1px solid", borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
            <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
              Gagal memuat data pendapatan dari database. Periksa koneksi/kredensial DB. ({error})
            </Typography>
          </Paper>
        )}

        {loading ? (
          <LoadingState label="Memuat Data" />
        ) : (
          <>
            {/* Dynamic Summary Cards Row */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(4, 1fr)",
            },
            gap: 2,
            mb: 4,
          }}
        >
          {/* Card 1: Total Tagihan (Proyeksi) */}
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
                Total Tagihan (Proyeksi)
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                {formatRupiah(totalExpectedRevenue)}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Seluruh nilai tagihan yang diterbitkan tahun ini
              </Typography>
              <Chip
                label={`${deltaExpectedPercentage >= 0 ? "+" : ""}${deltaExpectedPercentage}% vs ${comparisonYear}`}
                size="small"
                sx={{
                  mt: 1.5,
                  fontWeight: 600,
                  fontSize: "11px",
                  bgcolor: (theme) => alpha(theme.palette[deltaExpectedPercentage >= 0 ? "success" : "error"].main, 0.12),
                  color: (theme) => theme.palette[deltaExpectedPercentage >= 0 ? "success" : "error"].dark,
                }}
              />
            </CardContent>
          </Card>

          {/* Card 2: Total Terbayar */}
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
                Total Terbayar
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                {formatRupiah(totalActualRevenue)}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Tagihan yang sudah lunas (ada kwitansi pembayaran)
              </Typography>
              <Chip
                label={`${deltaActualRevenue >= 0 ? "+" : ""}${formatRupiah(deltaActualRevenue)} vs ${comparisonYear}`}
                size="small"
                sx={{
                  mt: 1.5,
                  fontWeight: 600,
                  fontSize: "11px",
                  bgcolor: (theme) => alpha(theme.palette[deltaActualRevenue >= 0 ? "success" : "error"].main, 0.12),
                  color: (theme) => theme.palette[deltaActualRevenue >= 0 ? "success" : "error"].dark,
                }}
              />
            </CardContent>
          </Card>

          {/* Card 3: Revenue Gap (klik untuk daftar tagihan belum dibayar) */}
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
                Tagihan yang belum dibayar — klik untuk melihat daftarnya
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

          {/* Card 4: Pertumbuhan Tagihan */}
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
                Pertumbuhan Tagihan
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}>
                {`${deltaMetricPercentage >= 0 ? "+" : ""}${deltaMetricPercentage}%`}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Perubahan total tagihan vs periode pembanding
              </Typography>
              <Chip
                label={`${deltaMetric >= 0 ? "+" : ""}${formatRupiah(deltaMetric)} vs ${comparisonYear}`}
                size="small"
                sx={{
                  mt: 1.5,
                  fontWeight: 600,
                  fontSize: "11px",
                  bgcolor: (theme) => alpha(theme.palette[deltaMetric >= 0 ? "success" : "error"].main, 0.12),
                  color: (theme) => theme.palette[deltaMetric >= 0 ? "success" : "error"].dark,
                }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* Dynamic Trend Chart Component */}
        <TrendChart
          series={timeBuckets.map(bucket => {
            const value = getMetricValueForBucket(scopedSnapshots, bucket.periods, metricType);
            let compareValue: number | undefined = undefined;
            if (compareYear !== null) {
              const comparisonPeriods = bucket.periods.map(period => {
                const parts = period.split("-");
                if (parts.length < 2) return String(compareYear);
                return `${compareYear}-${parts[1]}`;
              });
              compareValue = getMetricValueForBucket(scopedSnapshots, comparisonPeriods, metricType);
            }
            return {
              bucketKey: bucket.key,
              label: bucket.label,
              value,
              compareValue,
            };
          })}
          valueType="currency"
          year={year}
          compareYear={compareYear}
          initialPreviousValue={getMetricValueForBucket(scopedSnapshots, baselinePeriods, metricType)}
        />

        {/* Matrix Tree Breakdown Section */}
        <MatrixTable 
          rows={rows} 
          buckets={timeBuckets} 
          valueType="currency" 
          columnWidth="12rem"
          onLabelClick={(row) => {
            setDetailModal({
              isOpen: true,
              entityId: ("baseId" in row ? row.baseId : row.id),
              level: row.level,
              label: row.label,
              period: null,
            });
          }}
          onCellClick={(row, bucketKey) => {
            setDetailModal({
              isOpen: true,
              entityId: ("baseId" in row ? row.baseId : row.id),
              level: row.level,
              label: row.label,
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
        rows={enrichedRowsForModal}
        loading={detailLoading}
        title={detailModal.level === "revenue_gap" ? "Detail Kesenjangan Pendapatan (Tidak Dibayar)" : `Detail Pendapatan ${detailModal.label || ""}`}
        showRevenue={true}
        showBandwidth={false}
        metricMode="revenue_gap"
        context={detailContext}
      />
    </Box>
  );
}

export default function TotalRevenueDashboardPage() {
  return (
    <Suspense fallback={
      <Box sx={{ p: "1.5rem", backgroundColor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="xl">
          <LoadingState label="Memuat Data" minHeight="30rem" />
        </Container>
      </Box>
    }>
      <TotalRevenueDashboard />
    </Suspense>
  );
}
// Trigger Hot Reload for DetailTableModal column header update to 'Manager'
