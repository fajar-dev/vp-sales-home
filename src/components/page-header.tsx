"use client";

import React from "react";
import { Box, Typography } from "@mui/material";

export interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <Box sx={{ width: "100%", pb: 1 }}>
      <Typography
        variant="h4"
        sx={{ mb: 0.25 }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
      >
        {subtitle}
      </Typography>
    </Box>
  );
}
