"use client";

import React from "react";
import { Box, Typography, Button, Skeleton, Stack, Paper } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

interface DashboardLoadingProps {
  message?: string;
}

/**
 * Loading skeleton shown while API data is being fetched.
 */
export function DashboardLoading({ message = "Memuat data dari server..." }: DashboardLoadingProps) {
  return (
    <Box>
      {/* Chart skeleton */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: "16px",
          backgroundColor: "background.paper",
          mb: 3,
        }}
      >
        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: "8px" }} />
      </Paper>

      {/* Matrix skeleton */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: "12px",
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          mb: 3,
        }}
      >
        <Stack spacing={0}>
          <Box sx={{ p: 1.5, backgroundColor: "#f8fafc" }}>
            <Skeleton variant="text" width="60%" height={24} />
          </Box>
          {[...Array(5)].map((_, i) => (
            <Box key={i} sx={{ px: 1.5, py: 1, borderTop: "1px solid", borderColor: "divider" }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Skeleton variant="text" width="20%" height={20} />
                {[...Array(6)].map((_, j) => (
                  <Skeleton key={j} variant="text" width="10%" height={20} />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
        {message}
      </Typography>
    </Box>
  );
}

interface DashboardErrorProps {
  error: string;
  onRetry: () => void;
}

/**
 * Error state shown when API call fails. Includes retry button.
 */
export function DashboardError({ error, onRetry }: DashboardErrorProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        borderRadius: "16px",
        border: "1px solid",
        borderColor: "error.light",
        backgroundColor: "#fef2f2",
        textAlign: "center",
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600, color: "error.main", mb: 1 }}>
        Gagal Memuat Data
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        {error}
      </Typography>
      <Button
        variant="outlined"
        color="error"
        startIcon={<RefreshIcon />}
        onClick={onRetry}
        sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 600 }}
      >
        Coba Lagi
      </Button>
    </Paper>
  );
}
