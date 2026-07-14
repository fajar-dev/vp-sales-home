"use client";

import { useEffect, useState } from "react";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      return;
    }
    let cancelled = false;

    fetch(cacheKey)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setRows([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  return { rows: enabled ? rows : [], loading: enabled && loading, error: enabled ? error : null };
}
