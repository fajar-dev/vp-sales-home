"use client";

import { useEffect, useState } from "react";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import { getApiUrl } from "@/lib/url";

interface RevenueState {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  loading: boolean;
  error: string | null;
}

/** Fetches revenue-grain snapshots (expected/actual) from /api/revenue. */
export function useRevenueSnapshots(years: number[]): RevenueState {
  const key = [...new Set(years)].sort().join(",");
  const [state, setState] = useState<RevenueState>({
    snapshots: [],
    nodes: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch(getApiUrl(`/api/revenue?years=${key}`))
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
        setState({ snapshots: [], nodes: [], loading: false, error: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
