import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  MenuItem,
  Select,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Stack,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";

export interface EnrichedDetailRow {
  serviceId: string;
  customerName: string;
  serviceName: string;
  branchName: string | null;
  leadName: string | null;
  amName: string | null;
  serviceGroup: string;
  installationAddress: string;
  generatedAt: string;
  currentStatus: string;
  currentTotalActive: number;
  bandwidthMbps: number | null;
  expectedRevenue?: number | null;
  period?: string;
  activeDate?: string;
  churnDate?: string;
  tenureText?: string;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
}

interface DetailTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: EnrichedDetailRow[];
  title?: string;
  subtitle?: string;
  showRevenue?: boolean;
  showBandwidth?: boolean;
  metricMode?: "total_service" | "new_service" | "churn" | "accumulation" | "revenue_gap";
}

type SortField = "customerName" | "serviceName" | "branchName" | "currentStatus" | "currentTotalActive" | "expectedRevenue" | "activeDate" | "churnDate" | "tenureText" | "invoiceNumber" | "receiptNumber" | "period";
type SortOrder = "asc" | "desc";

function formatRupiah(value: number): string {
  if (value === 0) return "Rp 0";
  const absValue = Math.abs(value);
  const formatted = `Rp ${absValue.toLocaleString("id-ID")}`;
  return value < 0 ? `-${formatted}` : formatted;
}

function resolveStatusColor(status: string): "default" | "success" | "error" | "warning" {
  if (status === "active") return "success";
  if (status === "blocked") return "warning";
  if (status === "churned") return "error";
  return "default";
}

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatPeriodLabel(period: string): string {
  if (!period) return "—";
  const parts = period.split("-");
  if (parts.length < 2) return period;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${MONTH_NAMES_ID[monthIdx]} ${year}`;
  }
  return period;
}

export function DetailTableModal({ 
  isOpen, 
  onClose, 
  rows,
  title = "Detail Data",
  subtitle = "Disinkronkan dengan filter aktif, dilengkapi pencarian, pengurutan, dan penomoran halaman.",
  showRevenue = false,
  showBandwidth = true,
  metricMode
}: DetailTableModalProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortBy, setSortBy] = useState<SortField>("customerName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // Gather unique months present in rows sorted from newest to oldest
  const uniqueMonths = useMemo(() => {
    const months = rows.map((r) => r.period).filter((p): p is string => !!p);
    return Array.from(new Set(months)).sort().reverse();
  }, [rows]);

  // Reset page & month filter on rows change
  useEffect(() => {
    setPage(1);
    setSelectedMonth("all");
  }, [search, sortBy, sortOrder, rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    let result = rows;
    if (selectedMonth !== "all") {
      result = result.filter((row) => row.period === selectedMonth);
    }

    const searched = keyword
      ? result.filter((row) =>
          [
            row.customerName,
            row.serviceName,
            row.branchName,
            row.leadName ?? "",
            row.amName ?? "",
            row.serviceGroup,
            row.installationAddress,
            row.serviceId,
            row.activeDate ?? "",
            row.churnDate ?? "",
            row.tenureText ?? "",
            row.invoiceNumber ?? "",
            row.receiptNumber ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        )
      : result;

    const sorted = [...searched].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
      }

      return sortOrder === "asc"
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return sorted;
  }, [rows, search, sortBy, sortOrder, selectedMonth]);

  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  return (
    <Dialog 
      open={isOpen} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth 
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            maxHeight: "90vh",
            height: "42rem",
            display: "flex",
            flexDirection: "column",
          }
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: "-0.2px", color: "text.primary" }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            mt: -1,
            mr: -1,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider", backgroundColor: "#f8fafc" }}>
          <Stack 
            direction={{ xs: "column", md: "row" }} 
            spacing={2} 
            sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between" }}
          >
            <TextField
              size="small"
              placeholder="Cari pelanggan, layanan, cabang..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                }
              }}
              sx={{
                minWidth: { xs: "100%", md: "300px" },
                backgroundColor: "background.paper",
                "& .MuiOutlinedInput-root": {
                  height: "36px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "text.primary",
                },
              }}
            />

            <Stack direction="row" spacing={2}>
              {uniqueMonths.length > 0 && (
                <Select
                  size="small"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  renderValue={(selected) => selected === "all" ? "Semua Bulan" : formatPeriodLabel(selected)}
                  sx={{
                    minWidth: 140,
                    height: "36px",
                    borderRadius: "10px",
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
                  <MenuItem value="all" sx={{ fontSize: "13px", fontWeight: 500 }}>Semua Bulan</MenuItem>
                  {uniqueMonths.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontSize: "13px", fontWeight: 500 }}>
                      {formatPeriodLabel(m)}
                    </MenuItem>
                  ))}
                </Select>
              )}
              <Select
                size="small"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                sx={{
                  minWidth: 160,
                  height: "36px",
                  borderRadius: "10px",
                  fontWeight: 500,
                  fontSize: "13px",
                  color: "text.primary",
                  backgroundColor: "background.paper",
                  "& .MuiSelect-select": {
                    py: 0.8,
                    px: 1.5,
                  },
                }}
                displayEmpty
              >
                <MenuItem value="customerName" sx={{ fontSize: "13px", fontWeight: 500 }}>Nama pelanggan</MenuItem>
                <MenuItem value="serviceName" sx={{ fontSize: "13px", fontWeight: 500 }}>Nama layanan</MenuItem>
                <MenuItem value="branchName" sx={{ fontSize: "13px", fontWeight: 500 }}>Nama cabang</MenuItem>
                <MenuItem value="currentStatus" sx={{ fontSize: "13px", fontWeight: 500 }}>Status</MenuItem>
                {rows.some((r) => r.period) && (
                  <MenuItem value="period" sx={{ fontSize: "13px", fontWeight: 500 }}>Bulan tagihan</MenuItem>
                )}
                {!metricMode && <MenuItem value="currentTotalActive" sx={{ fontSize: "13px", fontWeight: 500 }}>Layanan aktif saat ini</MenuItem>}
                <MenuItem value="activeDate" sx={{ fontSize: "13px", fontWeight: 500 }}>Tanggal aktif</MenuItem>
                {metricMode === "churn" && (
                  <>
                    <MenuItem value="churnDate" sx={{ fontSize: "13px", fontWeight: 500 }}>Tanggal blok</MenuItem>
                    <MenuItem value="tenureText" sx={{ fontSize: "13px", fontWeight: 500 }}>Lama berlangganan</MenuItem>
                  </>
                )}
                {metricMode === "revenue_gap" && (
                  <>
                    <MenuItem value="invoiceNumber" sx={{ fontSize: "13px", fontWeight: 500 }}>Invoice</MenuItem>
                    <MenuItem value="receiptNumber" sx={{ fontSize: "13px", fontWeight: 500 }}>Kwitansi (Receipt)</MenuItem>
                  </>
                )}
                {showRevenue && <MenuItem value="expectedRevenue" sx={{ fontSize: "13px", fontWeight: 500 }}>Pendapatan</MenuItem>}
              </Select>

              <Select
                size="small"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                sx={{
                  minWidth: 100,
                  height: "36px",
                  borderRadius: "10px",
                  fontWeight: 500,
                  fontSize: "13px",
                  color: "text.primary",
                  backgroundColor: "background.paper",
                  "& .MuiSelect-select": {
                    py: 0.8,
                    px: 1.5,
                  },
                }}
                displayEmpty
              >
                <MenuItem value="asc" sx={{ fontSize: "13px", fontWeight: 500 }}>Naik (Asc)</MenuItem>
                <MenuItem value="desc" sx={{ fontSize: "13px", fontWeight: 500 }}>Turun (Desc)</MenuItem>
              </Select>
            </Stack>
          </Stack>
        </Box>

        <TableContainer sx={{ flexGrow: 1, maxHeight: 500 }}>
          <Table 
            stickyHeader 
            size="small"
            sx={{
              "& .MuiTableCell-root": {
                whiteSpace: "nowrap",
              },
              "& .MuiTableCell-root:first-of-type": {
                pl: 3,
              },
              "& .MuiTableCell-root:last-of-type": {
                pr: 3,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Layanan</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Pelanggan</TableCell>
                {rows.some((r) => r.period) && (
                  <TableCell sx={{ backgroundColor: "#f8fafc" }}>Bulan Tagihan</TableCell>
                )}
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Grup Layanan</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Cabang</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Manajer</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>AM</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Status</TableCell>
                <TableCell sx={{ backgroundColor: "#f8fafc" }}>Tanggal Aktif</TableCell>
                {metricMode === "churn" && (
                  <>
                    <TableCell sx={{ backgroundColor: "#f8fafc" }}>Tanggal Blok</TableCell>
                    <TableCell sx={{ backgroundColor: "#f8fafc" }}>Lama Berlangganan</TableCell>
                  </>
                )}
                {metricMode === "revenue_gap" && (
                  <>
                    <TableCell sx={{ backgroundColor: "#f8fafc" }}>Invoice</TableCell>
                    <TableCell sx={{ backgroundColor: "#f8fafc" }}>Receipt</TableCell>
                  </>
                )}
                {showBandwidth && <TableCell sx={{ backgroundColor: "#f8fafc" }}>Bandwidth</TableCell>}
                {showRevenue && <TableCell sx={{ backgroundColor: "#f8fafc" }}>Pendapatan</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8 + (rows.some((r) => r.period) ? 1 : 0) + (metricMode === "churn" ? 2 : 0) + (metricMode === "revenue_gap" ? 2 : 0) + (showRevenue ? 1 : 0) + (showBandwidth ? 1 : 0)} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      Data tidak ditemukan untuk filter yang dipilih.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((item) => (
                  <TableRow key={`${item.serviceId}-${item.period || ""}-${item.generatedAt}`} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", flexDirection: "column" }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.serviceName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.serviceId}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.customerName}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 150, display: "block" }} title={item.installationAddress}>
                        {item.installationAddress}
                      </Typography>
                    </TableCell>
                    {rows.some((r) => r.period) && (
                      <TableCell sx={{ fontWeight: 600, color: "primary.main" }}>
                        {item.period ? formatPeriodLabel(item.period) : "—"}
                      </TableCell>
                    )}
                    <TableCell>{item.serviceGroup}</TableCell>
                    <TableCell>{item.branchName || "—"}</TableCell>
                    <TableCell>{item.leadName || "—"}</TableCell>
                    <TableCell>{item.amName || "—"}</TableCell>
                    <TableCell>
                      <Chip 
                        label={item.currentStatus} 
                        size="small"
                        sx={{ 
                          height: 24, 
                          fontSize: "0.7rem", 
                          fontWeight: 600, 
                          textTransform: "capitalize",
                          bgcolor: (theme) => {
                            const colorKey = resolveStatusColor(item.currentStatus);
                            return colorKey === "default" 
                              ? theme.palette.action.selected 
                              : alpha(theme.palette[colorKey].main, 0.12);
                          },
                          color: (theme) => {
                            const colorKey = resolveStatusColor(item.currentStatus);
                            return colorKey === "default"
                              ? theme.palette.text.secondary
                              : theme.palette[colorKey].dark;
                          },
                          border: "none",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {item.activeDate || "—"}
                    </TableCell>
                    {metricMode === "churn" && (
                      <>
                        <TableCell>
                          {item.churnDate || "—"}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {item.tenureText || "—"}
                        </TableCell>
                      </>
                    )}
                    {metricMode === "revenue_gap" && (
                      <>
                        <TableCell sx={{ fontWeight: 500, color: "text.primary" }}>
                          {item.invoiceNumber || "—"}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: item.receiptNumber ? "text.primary" : "error.main", 
                            fontWeight: item.receiptNumber ? 500 : 600 
                          }}
                        >
                          {item.receiptNumber || "Belum Dibayar"}
                        </TableCell>
                      </>
                    )}
                    {showBandwidth && (
                      <TableCell>
                        {item.bandwidthMbps ? `${item.bandwidthMbps} Mbps` : "—"}
                      </TableCell>
                    )}
                    {showRevenue && (
                      <TableCell sx={{ fontWeight: 600, color: "primary.main" }}>
                        {item.expectedRevenue ? formatRupiah(item.expectedRevenue) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            {filteredRows.length} total baris · halaman {page} dari {totalPages}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              startIcon={<ChevronLeftIcon />}
            >
              Sebelumnya
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              endIcon={<ChevronRightIcon />}
            >
              Selanjutnya
            </Button>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
