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
import { TotalServiceV2MatrixRow } from "@/services/total-service";
import { RevenueMatrixRow } from "@/types/entities";

export type MatrixRowItem = TotalServiceV2MatrixRow | RevenueMatrixRow;

export interface MatrixTableProps {
  rows: MatrixRowItem[];
  buckets: { key: string; label: string }[];
  valueType?: "number" | "currency";
  columnWidth?: string;
  invertColors?: boolean; // If true, positive is bad (red) and negative is good (green)
  entityHeaderLabel?: string; // Custom label for the first column (e.g. "Branch & AM Breakdown", etc.)
  onLabelClick?: (row: MatrixRowItem) => void;
  onCellClick?: (row: MatrixRowItem, bucketKey: string) => void;
}

export default function MatrixTable({
  rows,
  buckets,
  valueType = "number",
  columnWidth = "8rem",
  invertColors = false,
  entityHeaderLabel = "Cabang",
  onLabelClick,
  onCellClick,
}: MatrixTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const flattenedRows = useMemo(() => {
    const list: Array<{ row: MatrixRowItem; depth: number }> = [];
    function recurse(rowsList: MatrixRowItem[], depth: number) {
      rowsList.forEach((row) => {
        list.push({ row, depth });
        if (expandedRows[row.id] && row.children) {
          recurse(row.children as MatrixRowItem[], depth + 1);
        }
      });
    }

    recurse(rows, 0);
    return list;
  }, [rows, expandedRows]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    buckets.forEach((bucket) => {
      totals[bucket.key] = rows.reduce((sum, r) => {
        const cell = r.cells.find((c) => c.bucketKey === bucket.key);
        return sum + (cell?.value ?? 0);
      }, 0);
    });
    return totals;
  }, [rows, buckets]);

  // Per-column grand totals plus their month-over-month delta and %, so the
  // Total row mirrors the delta/percentage shown in the data cells.
  const columnTotalCells = useMemo(() => {
    // A column with no data in any row (future / not-run months) stays blank
    // instead of reporting a misleading 0 / -100%.
    const base = buckets.map((bucket) => {
      const hasData = rows.some((r) => {
        const cell = r.cells.find((c) => c.bucketKey === bucket.key) as
          | { hasData?: boolean }
          | undefined;
        return cell ? cell.hasData !== false : false;
      });
      return { bucketKey: bucket.key, value: columnTotals[bucket.key] ?? 0, hasData };
    });

    // Delta compares against the nearest preceding column that has data.
    return base.map((cur, i) => {
      let deltaValue: number | null = null;
      let deltaPercentage: number | null = null;
      if (cur.hasData) {
        for (let j = i - 1; j >= 0; j--) {
          if (!base[j].hasData) continue;
          const prev = base[j].value;
          deltaValue = cur.value - prev;
          deltaPercentage =
            prev === 0 ? null : Math.round(((cur.value - prev) / prev) * 10000) / 100;
          break;
        }
      }
      return { ...cur, deltaValue, deltaPercentage };
    });
  }, [rows, buckets, columnTotals]);

  const parentMap = useMemo(() => {
    const map = new Map<string, MatrixRowItem>();
    function recurse(list: MatrixRowItem[], parent: MatrixRowItem | null) {
      list.forEach((r) => {
        if (parent) {
          map.set(r.id, parent);
        }
        if (r.children) {
          recurse(r.children as MatrixRowItem[], r);
        }
      });
    }
    recurse(rows, null);
    return map;
  }, [rows]);

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
        <Table sx={{ minWidth: 650 }} aria-label="matrix tree table">
          <TableHead sx={{ backgroundColor: "#f8fafc" }}>
            <TableRow>
              <TableCell sx={{ py: 1, minWidth: "15rem" }}>
                {entityHeaderLabel}
              </TableCell>
              {buckets.map((bucket) => (
                <TableCell
                  key={bucket.key}
                  align="right"
                  sx={{ 
                    py: 1, 
                    width: columnWidth,
                    minWidth: columnWidth,
                    maxWidth: columnWidth,
                  }}
                >
                  {bucket.label}
                </TableCell>
              ))}
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
                      </Box>
                    </Stack>
                  </TableCell>

                  {/* Dynamic Cells */}
                  {row.cells.map((cell: { bucketKey: string; value: number; deltaValue: number | null; deltaPercentage: number | null; hasData?: boolean }) => {
                    const isPositive = cell.deltaValue !== null && cell.deltaValue > 0;
                    const isNegative = cell.deltaValue !== null && cell.deltaValue < 0;

                      if (valueType === "currency") {
                        // 1. Calculate Contribution percentage
                        const parentRow = parentMap.get(row.id);
                        let total = 0;
                        if (!parentRow) {
                          total = columnTotals[cell.bucketKey] ?? 0;
                        } else {
                          const parentCell = parentRow.cells.find((c: { bucketKey: string; value: number }) => c.bucketKey === cell.bucketKey);
                          total = parentCell?.value ?? 0;
                        }

                        const contributionPct = total > 0 ? Math.round((cell.value / total) * 100) : 0;
                        const isValZero = cell.value === 0;
                        const displayValStr = isValZero ? "Rp. -" : `Rp.\u00A0${Math.abs(cell.value).toLocaleString("id-ID")}`;
                        const displayValCol = isValZero ? "text.secondary" : "primary.main";
                        const displayContribStr = isValZero ? "- %" : `${contributionPct}%`;

                        // Line 2: Delta Value
                        const isDeltaZero = cell.deltaValue === 0 || cell.deltaValue === null;
                        const displayDeltaStr = isDeltaZero ? "-" : `Rp.\u00A0${Math.abs(cell.deltaValue as number).toLocaleString("id-ID")}`;
                        const displayDeltaCol = isDeltaZero
                          ? "text.secondary"
                          : invertColors
                          ? isPositive
                            ? "error.main"
                            : "success.main"
                          : isPositive
                          ? "success.main"
                          : "error.main";

                        // Line 3: Delta Percentage
                        const displayDeltaPctStr = isDeltaZero || cell.deltaPercentage === null
                          ? "-%"
                          : `${cell.deltaPercentage > 0 ? "+" : ""}${cell.deltaPercentage}%`;
                        const displayDeltaPctCol = isDeltaZero || cell.deltaPercentage === null
                          ? "text.secondary"
                          : invertColors
                          ? cell.deltaPercentage > 0
                            ? "error.main"
                            : "success.main"
                          : cell.deltaPercentage > 0
                          ? "success.main"
                          : "error.main";

                        return (
                          <TableCell
                            key={cell.bucketKey}
                            align="right"
                            sx={{
                              py: 0.75,
                              width: columnWidth,
                              minWidth: columnWidth,
                              maxWidth: columnWidth,
                            }}
                          >
                            <Box
                              onClick={() => onCellClick?.(row, cell.bucketKey)}
                              sx={{
                                cursor: onCellClick ? "pointer" : "inherit",
                                borderRadius: 1,
                                p: 0.5,
                                marginRight: -0.5,
                                "&:hover": onCellClick ? { bgcolor: "action.hover" } : {},
                              }}
                            >
                              {/* Line 1: Main Value & Contribution */}
                              <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{ justifyContent: "flex-end", alignItems: "baseline", whiteSpace: "nowrap" }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    color: displayValCol,
                                  }}
                                >
                                  {displayValStr}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 500,
                                    color: "text.secondary",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {displayContribStr}
                                </Typography>
                              </Stack>

                              {/* Line 2: Delta Value */}
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color: displayDeltaCol,
                                  fontSize: "0.8rem",
                                  mt: 0.25,
                                }}
                              >
                                {displayDeltaStr}
                              </Typography>

                              {/* Line 3: Delta % */}
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  color: displayDeltaPctCol,
                                  display: "block",
                                  mt: 0.1,
                                }}
                              >
                                {displayDeltaPctStr}
                              </Typography>
                            </Box>
                          </TableCell>
                        );
                      }

                      // Otherwise fallback to standard number/percentage formatting.
                      // Buckets with no data yet (future/not-run months) render
                      // blank instead of a misleading 0 / -100%.
                      const isNoData = cell.hasData === false;
                      const displayValue = isNoData ? "–" : cell.value;
                      let displayDelta = "";
                      if (!isNoData && cell.deltaValue !== null && cell.deltaValue !== 0) {
                        displayDelta = `${isPositive ? "+" : ""}${cell.deltaValue}`;
                      }

                      return (
                        <TableCell
                          key={cell.bucketKey}
                          align="right"
                          sx={{
                            py: 0.75,
                            width: columnWidth,
                            minWidth: columnWidth,
                            maxWidth: columnWidth,
                          }}
                        >
                          <Box
                            onClick={() => onCellClick?.(row, cell.bucketKey)}
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
                                {displayValue}
                              </Typography>

                              {displayDelta && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 600,
                                    color: invertColors
                                      ? isPositive
                                        ? "error.main"
                                        : "success.main"
                                      : isPositive
                                      ? "success.main"
                                      : "error.main",
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
                                color: invertColors
                                  ? isPositive
                                    ? "error.main"
                                    : isNegative
                                    ? "success.main"
                                    : "text.secondary"
                                  : isPositive
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
                    })}
                </TableRow>
              );
            })}

            {flattenedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={buckets.length + 1} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Tidak ada data snapshot yang sesuai dengan filter scope user.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {/* Column totals: sum across the top-level rows (branches are
                disjoint, so this is the true per-period grand total). */}
            {flattenedRows.length > 0 && (
              <TableRow
                sx={{
                  backgroundColor: "#f8fafc",
                  "& td": {
                    borderTop: "2px solid",
                    borderColor: "divider",
                    backgroundColor: "#f8fafc",
                  },
                }}
              >
                <TableCell sx={{ py: 1, minWidth: "15rem" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                    Total
                  </Typography>
                </TableCell>
                {columnTotalCells.map((total) => {
                  const isPositive = total.deltaValue !== null && total.deltaValue > 0;

                  const deltaColor =
                    total.deltaValue === null || total.deltaValue === 0
                      ? "text.secondary"
                      : invertColors
                        ? isPositive
                          ? "error.main"
                          : "success.main"
                        : isPositive
                          ? "success.main"
                          : "error.main";

                  const valueStr = !total.hasData
                    ? "–"
                    : valueType === "currency"
                      ? total.value === 0
                        ? "Rp. -"
                        : `Rp.\u00A0${Math.abs(total.value).toLocaleString("id-ID")}`
                      : String(total.value);

                  const deltaStr =
                    total.deltaValue === null || total.deltaValue === 0
                      ? ""
                      : valueType === "currency"
                        ? `${isPositive ? "+" : "-"}Rp.\u00A0${Math.abs(total.deltaValue).toLocaleString("id-ID")}`
                        : `${isPositive ? "+" : ""}${total.deltaValue}`;

                  const pctStr =
                    total.deltaPercentage === null || total.deltaPercentage === 0
                      ? "-"
                      : `${total.deltaPercentage > 0 ? "+" : ""}${total.deltaPercentage}%`;

                  return (
                    <TableCell
                      key={total.bucketKey}
                      align="right"
                      sx={{
                        py: 0.75,
                        width: columnWidth,
                        minWidth: columnWidth,
                        maxWidth: columnWidth,
                      }}
                    >
                      {valueType === "currency" ? (
                        <>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, color: "text.primary", whiteSpace: "nowrap" }}
                          >
                            {valueStr}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 500, fontSize: "0.8rem", mt: 0.25, color: deltaColor, whiteSpace: "nowrap" }}
                          >
                            {deltaStr || "-"}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", mt: 0.1, fontWeight: 600, color: deltaColor }}
                          >
                            {pctStr === "-" ? "-%" : pctStr}
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ justifyContent: "flex-end", alignItems: "baseline", whiteSpace: "nowrap" }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                              {valueStr}
                            </Typography>
                            {deltaStr && (
                              <Typography variant="caption" sx={{ fontWeight: 600, color: deltaColor }}>
                                ({deltaStr})
                              </Typography>
                            )}
                          </Stack>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", mt: 0.1, fontWeight: 600, color: deltaColor }}
                          >
                            ~ {pctStr}
                          </Typography>
                        </>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
