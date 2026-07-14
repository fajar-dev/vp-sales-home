"use client";

import React from "react";
import { Paper, Typography, CircularProgress } from "@mui/material";

export interface LoadingStateProps {
  minHeight?: string | number;
  label?: string;
}

export default function LoadingState({
  minHeight = "24rem",
  label = "Memuat Data",
}: LoadingStateProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        minHeight,
        my: 3,
        borderRadius: "16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "background.paper",
        border: "0px solid",
        p: 4,
      }}
    >
      <CircularProgress
        size={44}
        thickness={4}
        sx={{
          color: "primary.main",
          mb: 2,
        }}
      />
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 600,
          color: "text.primary",
          letterSpacing: "-0.2px",
        }}
      >
        {label}
      </Typography>
    </Paper>
  );
}
