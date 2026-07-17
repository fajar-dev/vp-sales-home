"use client";

import { useEffect, useState } from "react";
import type {
  ServiceMonthlySnapshot,
  OrganizationNode,
} from "@/types/entities";
import { getApiUrl } from "@/lib/url";
import { showApiError } from "@/components/toast-host";

interface SnapshotsResult {
  key: string | null;
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  error: string | null;
}

interface SnapshotsState {
  snapshots: ServiceMonthlySnapshot[];
  nodes: OrganizationNode[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches aggregated monthly service snapshots + org hierarchy for the given
 * years. Drives the "Layanan Aktif", "Layanan Baru", and "Churn" dashboards.
 * `tenure` (optional) filters rows by subscription-age bucket server-side.
 *
 * `loading` is derived: it is true whenever the last completed request does
 * not match the current filters, so filter changes always re-show the loader
 * instead of leaving stale rows on screen.
 */
export function useSnapshots(years: number[], tenure: string = "all"): SnapshotsState {
  const key = [...new Set(years)].sort().join(",");
  const tenureKey = tenure || "all";
  const requestKey = `${key}|${tenureKey}`;

  const [result, setResult] = useState<SnapshotsResult>({
    key: null,
    snapshots: [],
    nodes: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ years: key });
    if (tenureKey !== "all") qs.set("tenure", tenureKey);

    fetch(getApiUrl(`/api/snapshots?${qs.toString()}`))
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
          key: requestKey,
          snapshots: data.snapshots ?? [],
          nodes: data.nodes ?? [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        showApiError(`Gagal memuat data layanan: ${message}`);
        setResult({ key: requestKey, snapshots: [], nodes: [], error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [key, tenureKey, requestKey]);

  const isCurrent = result.key === requestKey;

  return {
    snapshots: isCurrent ? result.snapshots : [],
    nodes: isCurrent ? result.nodes : [],
    loading: !isCurrent,
    error: isCurrent ? result.error : null,
  };
}
