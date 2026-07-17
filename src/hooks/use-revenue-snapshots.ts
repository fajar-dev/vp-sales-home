"use client";

import { useEffect, useState } from "react";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import { getApiUrl } from "@/lib/url";
import { showApiError } from "@/components/toast-host";

interface RevenueResult {
  key: string | null;
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  error: string | null;
}

interface RevenueState {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches aggregated revenue rows (expected/actual) from /api/revenue.
 * `loading` is derived from the last completed request key so year changes
 * always re-show the loader.
 */
export function useRevenueSnapshots(years: number[]): RevenueState {
  const key = [...new Set(years)].sort().join(",");

  const [result, setResult] = useState<RevenueResult>({
    key: null,
    snapshots: [],
    nodes: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch(getApiUrl(`/api/revenue?years=${key}`))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setResult({
          key,
          snapshots: data.snapshots ?? [],
          nodes: data.nodes ?? [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        showApiError(`Gagal memuat data pendapatan: ${message}`);
        setResult({ key, snapshots: [], nodes: [], error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const isCurrent = result.key === key;

  return {
    snapshots: isCurrent ? result.snapshots : [],
    nodes: isCurrent ? result.nodes : [],
    loading: !isCurrent,
    error: isCurrent ? result.error : null,
  };
}
