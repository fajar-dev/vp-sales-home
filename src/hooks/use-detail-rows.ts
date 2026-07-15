"use client";

import { useEffect, useState } from "react";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";
import { getApiUrl } from "@/lib/url";

/**
 * Fetches click-scoped detail rows from a detail API endpoint. Pass `null` as
 * params (or `enabled: false`) to skip fetching (e.g. modal closed).
 */
export function useDetailRows(
  endpoint: string,
  params: Record<string, string | null | undefined> | null,
  enabled: boolean,
): { rows: EnrichedDetailRow[]; loading: boolean; error: string | null } {
  const queryString = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";

  const cacheKey = enabled ? `${endpoint}?${queryString}` : "";
  const [rows, setRows] = useState<EnrichedDetailRow[]>([]);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      return;
    }
    let cancelled = false;

    fetch(getApiUrl(cacheKey))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setFetchedKey(cacheKey);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setRows([]);
        setFetchedKey(cacheKey);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const isLoading = Boolean(enabled && cacheKey && fetchedKey !== cacheKey && !error);

  return {
    rows: enabled ? rows : [],
    loading: isLoading,
    error: enabled ? error : null,
  };
}
