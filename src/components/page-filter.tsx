"use client";

import React from "react";
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Button,
  Typography,
} from "@mui/material";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";

export interface PageFilterProps {
  year: number;
  availableYears?: number[];
  
  // Year Comparison Config
  compareYear?: number | null;
  onCompareYearChange?: (compareYear: number | null) => void;
  
  // POV Toggle Config
  showPov?: boolean;
  povMode?: "operational" | "sales";
  
  // Metric Toggle Config
  metricMode?: string;
  metricOptions?: Array<{ value: string; label: string }>;
  
  // Granularity Config
  granularity: "month" | "quarter" | "semester" | "year";
  
  // Callbacks
  onFilterToggle?: () => void;
  onYearChange?: (year: number) => void;
  onPovChange?: (pov: "operational" | "sales") => void;
  onMetricChange?: (metric: string) => void;
  onGranularityChange?: (granularity: "month" | "quarter" | "semester" | "year") => void;
  
  // Extra controls slot
  extraControls?: React.ReactNode;
}

const GRANULARITY_OPTIONS: Array<{ value: "month" | "quarter" | "semester" | "year"; label: string }> = [
  { value: "month", label: "Bulan" },
  { value: "quarter", label: "Kuartal" },
  { value: "semester", label: "Semester" },
  { value: "year", label: "Tahun" },
];

export default function PageFilter({
  year,
  availableYears = [2024, 2025, 2026],
  compareYear = null,
  onCompareYearChange,
  showPov = false,
  povMode = "sales",
  metricMode = "",
  metricOptions = [],
  granularity,
  onFilterToggle,
  onYearChange,
  onPovChange,
  onMetricChange,
  onGranularityChange,
  extraControls,
}: PageFilterProps) {
  return (
    <Box sx={{ width: "100%", pb: 1 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", md: "center" },
        }}
      >
        {/* Left Side: Filter Button, Year, POV & Metric Toggles */}
        <Stack
          direction="row"
          spacing={1.5}
          useFlexGap
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
          }}
        >
          {/* Funnel Filter Button */}
          {onFilterToggle && (
            <Button
              variant="outlined"
              onClick={onFilterToggle}
              sx={{
                minWidth: "36px",
                width: "36px",
                height: "36px",
                p: 0,
                borderRadius: "10px",
                borderColor: "divider",
                color: "text.primary",
                backgroundColor: "background.paper",
                "&:hover": {
                  borderColor: "text.secondary",
                  backgroundColor: "action.hover",
                },
              }}
            >
              <FilterAltOutlinedIcon sx={{ fontSize: "20px" }} />
            </Button>
          )}

          {/* Year Select & Comparison Group */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {/* Year Dropdown */}
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <Select
                value={year}
                onChange={(e) => {
                  const newYear = Number(e.target.value);
                  onYearChange?.(newYear);
                  
                  // Auto-adjust comparison year if it's active and no longer valid
                  if (compareYear !== null) {
                    const newCompOptions = availableYears.filter((y) => y === newYear - 1 || y === newYear + 1);
                    if (newCompOptions.length > 0) {
                      if (!newCompOptions.includes(compareYear)) {
                        onCompareYearChange?.(newCompOptions[0]);
                      }
                    } else {
                      onCompareYearChange?.(null);
                    }
                  }
                }}
                sx={{
                  height: "36px",
                  borderRadius: "10px",
                  borderColor: "divider",
                  fontWeight: 500,
                  fontSize: "13px",
                  color: "text.primary",
                  backgroundColor: "background.paper",
                  "& .MuiSelect-select": {
                    py: 0.8,
                    px: 1.5,
                  },
                }}
              >
                {[...availableYears].sort((a, b) => b - a).map((y) => (
                  <MenuItem key={y} value={y} sx={{ fontSize: "13px", fontWeight: 500 }}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* VS Button for Comparison Toggle */}
            <Button
              variant={compareYear !== null ? "contained" : "outlined"}
              onClick={() => {
                if (compareYear !== null) {
                  onCompareYearChange?.(null);
                } else {
                  const options = availableYears.filter((y) => y === year - 1 || y === year + 1);
                  if (options.length > 0) {
                    onCompareYearChange?.(options[0]);
                  }
                }
              }}
              sx={{
                height: "36px",
                minWidth: "42px",
                px: 1.5,
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 700,
                backgroundColor: compareYear !== null ? "primary.main" : "background.paper",
                color: compareYear !== null ? "primary.contrastText" : "text.secondary",
                borderColor: "divider",
                "&:hover": {
                  backgroundColor: compareYear !== null ? "primary.dark" : "action.hover",
                  borderColor: compareYear !== null ? "primary.dark" : "text.secondary",
                },
              }}
            >
              VS
            </Button>

            {/* Comparison Year Dropdown (strictly year - 1 or year + 1) */}
            {compareYear !== null && (
              <FormControl size="small" sx={{ minWidth: 90 }}>
                <Select
                  value={compareYear}
                  onChange={(e) => onCompareYearChange?.(Number(e.target.value))}
                  sx={{
                    height: "36px",
                    borderRadius: "10px",
                    borderColor: "divider",
                    fontWeight: 500,
                    fontSize: "13px",
                    color: "text.primary",
                    backgroundColor: "background.paper",
                    "& .MuiSelect-select": {
                      py: 0.8,
                      px: 1.5,
                    },
                  }}
                >
                  {[...availableYears]
                    .filter((y) => y === year - 1 || y === year + 1)
                    .sort((a, b) => b - a)
                    .map((y) => (
                      <MenuItem key={y} value={y} sx={{ fontSize: "13px", fontWeight: 500 }}>
                        {y}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
          </Stack>

          {/* POV Toggle Button Group (Operational vs Sales) */}
          {showPov && (
            <ToggleButtonGroup
              value={povMode}
              exclusive
              onChange={(_, value) => value && onPovChange?.(value as "operational" | "sales")}
              aria-label="point of view"
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
                value="operational"
                aria-label="operational view"
                sx={{
                  fontSize: "13px",
                  fontWeight: povMode === "operational" ? 600 : 500,
                  px: 2.5,
                  borderRadius: "9px !important",
                  color: povMode === "operational" ? "#0f172a" : "#64748b",
                  backgroundColor: povMode === "operational" ? "#ffffff" : "transparent",
                  "&.Mui-selected": {
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                  },
                }}
              >
                Tampilan Operasional
              </ToggleButton>
              <ToggleButton
                value="sales"
                aria-label="sales view"
                sx={{
                  fontSize: "13px",
                  fontWeight: povMode === "sales" ? 600 : 500,
                  px: 2.5,
                  borderRadius: "9px !important",
                  color: povMode === "sales" ? "#0f172a" : "#64748b",
                  backgroundColor: povMode === "sales" ? "#ffffff" : "transparent",
                  "&.Mui-selected": {
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                  },
                }}
              >
                Tampilan Sales
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Metric Toggle Button Group */}
          {metricOptions.length > 0 && (
            <ToggleButtonGroup
              value={metricMode}
              exclusive
              onChange={(_, value) => value && onMetricChange?.(value)}
              aria-label="metric mode"
              size="small"
              sx={{
                height: "36px",
                borderRadius: "12px",
                backgroundColor: "#f1f5f9", // Slate 100
                border: "none",
                p: "3px",
              }}
            >
              {metricOptions.map((metric) => (
                <ToggleButton
                  key={metric.value}
                  value={metric.value}
                  aria-label={metric.label}
                  sx={{
                    fontSize: "13px",
                    fontWeight: metricMode === metric.value ? 600 : 500,
                    px: 2.5,
                    borderRadius: "9px !important",
                    color: metricMode === metric.value ? "#0f172a" : "#64748b",
                    backgroundColor: metricMode === metric.value ? "#ffffff" : "transparent",
                    "&.Mui-selected": {
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                    },
                  }}
                >
                  {metric.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          {extraControls}
        </Stack>

        {/* Right Side: Granularity Tabs (Month, Quarter, Semester, Year) */}
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: "center" }}
        >
          {GRANULARITY_OPTIONS.map((option) => {
            const isActive = granularity === option.value;
            return (
              <Box
                key={option.value}
                onClick={() => onGranularityChange?.(option.value)}
                sx={{
                  position: "relative",
                  px: 1.5,
                  py: 0.5,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    "& .option-label": {
                      color: "text.primary",
                    },
                  },
                }}
              >
                <Typography
                  className="option-label"
                  variant="body2"
                  sx={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "text.primary" : "text.secondary",
                    transition: "color 0.2s ease",
                  }}
                >
                  {option.label}
                </Typography>
                {isActive && (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 0,
                      left: 16,
                      right: 16,
                      height: "2.5px",
                      backgroundColor: "#0f172a", // Dark underline
                      borderRadius: "2px",
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>
      </Stack>
    </Box>
  );
}
