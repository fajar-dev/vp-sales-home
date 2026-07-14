"use client";

import React, { useState, useMemo } from "react";
import { Box, Paper, Typography, Stack, useTheme } from "@mui/material";

export interface TrendChartPoint {
  bucketKey: string;
  label: string;
  value: number;
  compareValue?: number;
}

export interface TrendChartProps {
  series: TrendChartPoint[];
  valueType?: "number" | "currency";
  year?: number;
  compareYear?: number | null;
  initialPreviousValue?: number | null;
}

// Helper to format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Helper to format short Y-axis labels
function formatAxisLabel(value: number, type: "number" | "currency"): string {
  if (value === 0) return "0";
  if (type === "currency") {
    if (Math.abs(value) >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
    if (Math.abs(value) >= 1000000) return `${Math.round(value / 1000000)}M`;
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}K`;
  }
  return value.toString();
}

export default function TrendChart({ 
  series, 
  valueType = "number", 
  year,
  compareYear = null,
  initialPreviousValue = null
}: TrendChartProps) {
  const theme = useTheme();
  const chartHeight = 220;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxChartValue = useMemo(() => {
    if (!series || series.length === 0) return 10;
    const max = Math.max(
      ...series.map((s) => Math.max(s.value, s.compareValue ?? 0)),
      valueType === "currency" ? 10000000 : 5
    );
    return Math.ceil(max * 1.15);
  }, [series, valueType]);

  const hasComparison = compareYear !== null;

  return (
    <Paper
      elevation={0}
      sx={{
        px: "1rem",
        pb: "1rem",
        pt: 0,
        borderRadius: "16px",
        backgroundColor: "background.paper",
        position: "relative",
      }}
    >
      {/* Title & Legend Row */}
      {hasComparison && (
        <Stack direction="row" spacing={3} sx={{ pt: 1.5, pb: 1, alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: theme.palette.primary.main }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                {year}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: theme.palette.primary.light }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                {compareYear}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      )}

      <Box sx={{ width: "100%", height: "13.75rem", position: "relative", mt: 1 }}>
        {/* Interactive Hover Tooltip */}
        {hoveredIdx !== null && series[hoveredIdx] && (
          <Box
            sx={{
              position: "absolute",
              top: -85,
              left: `calc(${(hoveredIdx * (100 / series.length)) + (100 / series.length) / 2}% - 100px)`,
              width: 200,
              bgcolor: "#ffffff",
              borderRadius: "12px",
              boxShadow: "0px 6px 24px rgba(0, 0, 0, 0.12)",
              border: "1px solid",
              borderColor: "divider",
              p: 1.5,
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {series[hoveredIdx].label}
            </Typography>
            <Stack spacing={0.75}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  {hasComparison ? `${year}` : "Nilai"}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                  {valueType === "currency" ? formatCurrency(series[hoveredIdx].value) : series[hoveredIdx].value}
                </Typography>
              </Stack>
              
              {hasComparison && series[hoveredIdx].compareValue !== undefined && (
                <>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>
                      {compareYear}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary" }}>
                      {valueType === "currency" ? formatCurrency(series[hoveredIdx].compareValue!) : series[hoveredIdx].compareValue!}
                    </Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>Tumbuh YoY</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {(() => {
                        const mainVal = series[hoveredIdx].value;
                        const compVal = series[hoveredIdx].compareValue!;
                        const diff = mainVal - compVal;
                        const sign = diff > 0 ? "+" : "";
                        return `${sign}${valueType === "currency" ? formatCurrency(diff) : diff}`;
                      })()}
                    </Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>Tumbuh %</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {(() => {
                        const mainVal = series[hoveredIdx].value;
                        const compVal = series[hoveredIdx].compareValue!;
                        const diff = mainVal - compVal;
                        if (compVal === 0) return diff > 0 ? "+100%" : "0%";
                        const pct = (diff / compVal) * 100;
                        const sign = pct > 0 ? "+" : "";
                        const formattedPct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(pct);
                        return `${sign}${formattedPct}%`;
                      })()}
                    </Typography>
                  </Stack>
                </>
              )}

              {!hasComparison && (hoveredIdx > 0 || (hoveredIdx === 0 && initialPreviousValue !== null)) && (
                <>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>Selisih MoM</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {(() => {
                        const prev = hoveredIdx > 0 ? series[hoveredIdx - 1].value : initialPreviousValue!;
                        const diff = series[hoveredIdx].value - prev;
                        const sign = diff > 0 ? "+" : "";
                        return `${sign}${valueType === "currency" ? formatCurrency(diff) : diff}`;
                      })()}
                    </Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>Tumbuh %</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {(() => {
                        const prev = hoveredIdx > 0 ? series[hoveredIdx - 1].value : initialPreviousValue!;
                        const diff = series[hoveredIdx].value - prev;
                        if (prev === 0) return diff > 0 ? "+100%" : "0%";
                        const pct = (diff / prev) * 100;
                        const sign = pct > 0 ? "+" : "";
                        const formattedPct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(pct);
                        return `${sign}${formattedPct}%`;
                      })()}
                    </Typography>
                  </Stack>
                </>
              )}
            </Stack>
          </Box>
        )}

        <svg width="100%" height="100%" style={{ overflow: "visible" }}>
          {/* Y-Axis Ticks & Labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio: number, idx: number) => {
            const y = chartHeight - ratio * chartHeight;
            const val = ratio * maxChartValue;
            return (
              <g key={`tick-${idx}`}>
                <line x1="-5" y1={y} x2="0" y2={y} stroke="#000000" strokeWidth="1" style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                <text
                  x="-12"
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="11px"
                  style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
                >
                  {formatAxisLabel(val, valueType)}
                </text>
              </g>
            );
          })}

          {/* X-Axis Baseline */}
          <line x1="0" y1={chartHeight} x2="100%" y2={chartHeight} stroke="#000000" strokeWidth="1" />
          
          {/* Y-Axis Line */}
          <line x1="0" y1="0" x2="0" y2={chartHeight} stroke="#000000" strokeWidth="1" />

          {/* Clip path to prevent bars from extending below the X-axis */}
          <defs>
            <clipPath id="bars-clip">
              <rect x="0" y="0" width="100%" height={chartHeight} />
            </clipPath>
          </defs>

          {/* Bars */}
          <g clipPath="url(#bars-clip)">
            {series.map((point, idx: number) => {
              const totalPoints = series.length;
              const containerWidth = 100 / totalPoints;
              const x = `${idx * containerWidth + containerWidth / 2}%`;
              
              const rawBarHeight = (point.value / maxChartValue) * chartHeight;
              const barHeight = Math.max(rawBarHeight, 0); 
              const y = chartHeight - barHeight;
              const isHovered = hoveredIdx === idx;

              // If has comparison, render side-by-side bars
              if (hasComparison && point.compareValue !== undefined) {
                const rawCompHeight = (point.compareValue / maxChartValue) * chartHeight;
                const compHeight = Math.max(rawCompHeight, 0);
                const compY = chartHeight - compHeight;

                return (
                  <g 
                    key={point.bucketKey}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Invisible wider rect for easier hovering interaction */}
                    <rect
                      x={`calc(${x} - 25px)`}
                      y="0"
                      width="50"
                      height={chartHeight}
                      fill="transparent"
                    />
                    
                    {/* Main Year Bar */}
                    <rect
                      x={`calc(${x} - 13px)`}
                      y={y}
                      width="11"
                      height={barHeight > 0 ? barHeight + 4 : 0}
                      fill={theme.palette.primary.main}
                      rx="2"
                      opacity={isHovered ? 0.75 : 1}
                      style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
                    />

                    {/* Comparison Year Bar */}
                    <rect
                      x={`calc(${x} + 2px)`}
                      y={compY}
                      width="11"
                      height={compHeight > 0 ? compHeight + 4 : 0}
                      fill={theme.palette.primary.light}
                      rx="2"
                      opacity={isHovered ? 0.75 : 1}
                      style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
                    />
                  </g>
                );
              }

              // Standard MoM rendering (Single Bar)
              return (
                <g 
                  key={point.bucketKey}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Invisible wider rect for easier hovering interaction */}
                  <rect
                    x={`calc(${x} - 25px)`}
                    y="0"
                    width="50"
                    height={chartHeight}
                    fill="transparent"
                  />
                  
                  <rect
                    x={`calc(${x} - 12px)`}
                    y={y}
                    width="24"
                    height={barHeight > 0 ? barHeight + 4 : 0}
                    fill={theme.palette.primary.main}
                    rx="4"
                    opacity={isHovered ? 0.75 : 1}
                    style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
                  />
                </g>
              );
            })}
          </g>

          {/* X-Axis Labels */}
          {series.map((point, idx: number) => {
            const totalPoints = series.length;
            const containerWidth = 100 / totalPoints;
            const x = `${idx * containerWidth + containerWidth / 2}%`;
            return (
              <text
                key={`label-${point.bucketKey}`}
                x={x}
                y={chartHeight + 20}
                textAnchor="middle"
                fill="#64748b"
                fontSize="11px"
                fontWeight="500"
                style={{ transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
              >
                {point.label}
              </text>
            );
          })}
        </svg>
      </Box>
      <Box sx={{ height: 16 }} />
    </Paper>
  );
}
