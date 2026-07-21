"use client";

import React, { useState, useMemo } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Stack,
  IconButton,
} from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { NewServiceTrendRow, TrendMetricCell } from "@/services/new-service";

export interface TrendMatrixTableProps {
  rows: NewServiceTrendRow[];
  onLabelClick?: (row: NewServiceTrendRow) => void;
  onCellClick?: (row: NewServiceTrendRow, metricKey: string) => void;
}

export default function TrendMatrixTable({
  rows,
  onLabelClick,
  onCellClick,
}: TrendMatrixTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const flattenedRows = useMemo(() => {
    const list: Array<{ row: NewServiceTrendRow; depth: number }> = [];
    function recurse(rowsList: NewServiceTrendRow[], depth: number) {
      rowsList.forEach((row) => {
        list.push({ row, depth });
        if (expandedRows[row.id] && row.children) {
          recurse(row.children, depth + 1);
        }
      });
    }
    recurse(rows, 0);
    return list;
  }, [rows, expandedRows]);

  // Column totals across the top-level period rows (the full year).
  const totals = useMemo(() => {
    const acc = rows.reduce(
      (sum, r) => ({
        totalNewService: sum.totalNewService + r.totalNewService.value,
        homepaid: sum.homepaid + r.homepaid.value,
        homeconnect: sum.homeconnect + r.homeconnect.value,
        block: sum.block + r.block.value,
      }),
      { totalNewService: 0, homepaid: 0, homeconnect: 0, block: 0 },
    );
    const paymentRate =
      acc.totalNewService > 0 ? (acc.homepaid / acc.totalNewService) * 100 : 0;
    return { ...acc, paymentRate };
  }, [rows]);

  const renderMetricCell = (
    row: NewServiceTrendRow,
    cell: TrendMetricCell,
    metricKey: string
  ) => {
    const isPositive = cell.delta !== null && cell.delta > 0;
    const isNegative = cell.delta !== null && cell.delta < 0;

    let displayDelta = "";
    if (cell.delta !== null && cell.delta !== 0) {
      displayDelta = `${isPositive ? "+" : ""}${cell.delta}`;
    }

    return (
      <TableCell
        align="right"
        sx={{
          py: 0.75,
          width: "8rem",
          minWidth: "8rem",
          maxWidth: "8rem",
        }}
      >
        <Box
          onClick={() => onCellClick?.(row, metricKey)}
          sx={{
            cursor: onCellClick ? "pointer" : "inherit",
            borderRadius: 1,
            p: 0.5,
            marginRight: -0.5,
            "&:hover": onCellClick ? { bgcolor: "action.hover" } : {},
          }}
        >
          {/* Main Value & Delta Row */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ justifyContent: "flex-end", alignItems: "baseline" }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                color: "primary.main",
              }}
            >
              {cell.value}
            </Typography>

            {displayDelta && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: isPositive ? "success.main" : "error.main",
                }}
              >
                ({displayDelta})
              </Typography>
            )}
          </Stack>

          {/* Growth Percentage Row */}
          <Typography
            variant="caption"
            sx={{
              color: isPositive
                ? "success.main"
                : isNegative
                ? "error.main"
                : "text.secondary",
              display: "block",
              mt: 0.1,
            }}
          >
            ~ {cell.deltaPercentage !== null && cell.deltaPercentage !== 0 ? `${isPositive ? "+" : ""}${cell.deltaPercentage}%` : "-"}
          </Typography>
        </Box>
      </TableCell>
    );
  };

  const formatPercentageLabel = (val: number) => {
    // Format to Indonesian-style e.g., 37,5% instead of 37.5%
    return val.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "%";
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "12px",
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
        overflow: "hidden",
        mb: 3,
      }}
    >
      <TableContainer>
        <Table sx={{ minWidth: 650 }} aria-label="new service trend tree table">
          <TableHead sx={{ backgroundColor: "#f8fafc" }}>
            <TableRow>
              <TableCell sx={{ py: 1, minWidth: "15rem" }}>
                Bulan
              </TableCell>
              <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                Total Layanan Baru
              </TableCell>
              <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                Homepaid
              </TableCell>
              <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                Homeconnect
              </TableCell>
              <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                Blocked
              </TableCell>
              <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                Rasio Pembayaran
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {flattenedRows.map(({ row, depth }) => {
              const isOpen = expandedRows[row.id];
              const hasChildren = row.children && row.children.length > 0;

              return (
                <TableRow
                  key={row.id}
                  hover
                  sx={{
                    "&:hover": {
                      backgroundColor: "#f8fafc !important",
                    },
                  }}
                >
                  {/* Entity Name column with indent & expand action */}
                  <TableCell sx={{ pl: depth * 3 + 1.5, py: 0.75, minWidth: "15rem" }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start", minWidth: 0 }}>
                      {hasChildren ? (
                        <IconButton size="small" onClick={() => toggleRow(row.id)} sx={{ p: 0.25, flexShrink: 0 }}>
                          {isOpen ? (
                            <KeyboardArrowDownIcon sx={{ fontSize: "16px" }} />
                          ) : (
                            <KeyboardArrowRightIcon sx={{ fontSize: "16px" }} />
                          )}
                        </IconButton>
                      ) : (
                        <Box sx={{ width: 22, flexShrink: 0 }} />
                      )}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="body2"
                          onClick={() => onLabelClick?.(row)}
                          sx={{
                            fontWeight: depth === 0 ? 700 : depth === 1 ? 600 : 500,
                            color: depth === 0 ? "text.primary" : "text.secondary",
                            lineHeight: 1.2,
                            overflowWrap: "anywhere",
                            cursor: onLabelClick ? "pointer" : "inherit",
                            "&:hover": onLabelClick ? { color: "primary.main", textDecoration: "underline" } : {},
                          }}
                          title={row.label}
                        >
                          {row.label}
                        </Typography>
                        {row.level !== "period" && (
                          <Typography
                            variant="overline"
                            sx={{
                              lineHeight: 1,
                              display: "block",
                              mt: 0.25,
                            }}
                          >
                            {row.level === "lead_am" ? "manajer" : row.level === "am" ? "am" : row.level === "branch" ? "cabang" : row.level === "service_group" ? "grup layanan" : row.level === "service" ? "layanan" : row.level === "customer" ? "pelanggan" : "kategori"}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>

                  {/* Funnel Metrics Cells */}
                  {renderMetricCell(row, row.totalNewService, "totalNewService")}
                  {renderMetricCell(row, row.homepaid, "homepaid")}
                  {renderMetricCell(row, row.homeconnect, "homeconnect")}
                  {renderMetricCell(row, row.block, "block")}

                  {/* Payment Rate Cell */}
                  <TableCell
                    align="right"
                    sx={{
                      py: 0.75,
                      width: "8rem",
                      minWidth: "8rem",
                      maxWidth: "8rem",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: "text.primary",
                      }}
                    >
                      {formatPercentageLabel(row.paymentRate)}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}

            {flattenedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Tidak ada data snapshot yang sesuai dengan filter scope user.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {flattenedRows.length > 0 && (
              <TableRow
                sx={{
                  backgroundColor: "#f8fafc",
                  "& td": {
                    borderTop: "2px solid",
                    borderColor: "divider",
                    position: "sticky",
                    bottom: 0,
                    backgroundColor: "#f8fafc",
                  },
                }}
              >
                <TableCell sx={{ py: 1, minWidth: "15rem" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                    Total
                  </Typography>
                </TableCell>
                {[totals.totalNewService, totals.homepaid, totals.homeconnect, totals.block].map(
                  (value, idx) => (
                    <TableCell
                      key={idx}
                      align="right"
                      sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                        {value}
                      </Typography>
                    </TableCell>
                  ),
                )}
                <TableCell align="right" sx={{ py: 1, width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {formatPercentageLabel(totals.paymentRate)}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
