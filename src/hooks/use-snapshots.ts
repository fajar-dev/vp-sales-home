"use client";

import { useEffect, useState } from "react";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";

interface SnapshotsState {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches monthly service snapshots + org hierarchy for the given years from
 * the reporting API. Drives the "Layanan Aktif" and "Churn" dashboards.
 */
export function useSnapshots(years: number[]): SnapshotsState {
  const key = [...new Set(years)].sort().join(",");
  const [state, setState] = useState<SnapshotsState>({
    snapshots: [],
    nodes: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/snapshots?years=${key}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          snapshots: data.snapshots ?? [],
          nodes: data.nodes ?? [],
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          snapshots: [],
          nodes: [],
          loading: false,
          error: String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
