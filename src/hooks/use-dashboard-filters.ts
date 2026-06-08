"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { TotalServicePovMode, TotalServiceGranularity } from "@/types/entities";

export function useDashboardFilters(defaultYear = new Date().getFullYear()) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. Read values from searchParams first (highest priority, enables shareable links)
  const urlYear = searchParams.get("year");
  const urlCompareYear = searchParams.get("compareYear");
  const urlPov = searchParams.get("pov");
  const urlGranularity = searchParams.get("granularity");
  const urlTenure = searchParams.get("tenure");
  const urlDisplay = searchParams.get("display");

  // 2. Synchronize searchParams with sessionStorage on initial mount and when searchParams change
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if we need to restore state from sessionStorage
    const params = new URLSearchParams(searchParams.toString());
    let needsUpdate = false;

    if (!urlYear) {
      const storedYear = sessionStorage.getItem("dashboard_year");
      if (storedYear) {
        params.set("year", storedYear);
        needsUpdate = true;
      }
    } else {
      sessionStorage.setItem("dashboard_year", urlYear);
    }

    if (!urlCompareYear) {
      const storedCompareYear = sessionStorage.getItem("dashboard_compareYear");
      if (storedCompareYear) {
        params.set("compareYear", storedCompareYear);
        needsUpdate = true;
      }
    } else if (urlCompareYear) {
      sessionStorage.setItem("dashboard_compareYear", urlCompareYear);
    }

    if (!urlPov) {
      const storedPov = sessionStorage.getItem("dashboard_pov");
      if (storedPov) {
        params.set("pov", storedPov);
        needsUpdate = true;
      }
    } else {
      sessionStorage.setItem("dashboard_pov", urlPov);
    }

    if (!urlGranularity) {
      const storedGranularity = sessionStorage.getItem("dashboard_granularity");
      if (storedGranularity) {
        params.set("granularity", storedGranularity);
        needsUpdate = true;
      }
    } else {
      sessionStorage.setItem("dashboard_granularity", urlGranularity);
    }

    // Apply URL update if we restored any params
    if (needsUpdate) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, pathname, router, urlYear, urlCompareYear, urlPov, urlGranularity]);

  // 3. Derive current state
  const year = Number(urlYear || (typeof window !== "undefined" ? sessionStorage.getItem("dashboard_year") : null) || String(defaultYear));
  const compareYearRaw = urlCompareYear || (typeof window !== "undefined" ? sessionStorage.getItem("dashboard_compareYear") : null);
  const compareYear = compareYearRaw ? Number(compareYearRaw) : null;
  const povMode = (urlPov || (typeof window !== "undefined" ? sessionStorage.getItem("dashboard_pov") : null) || "sales") as TotalServicePovMode;
  const granularity = (urlGranularity || (typeof window !== "undefined" ? sessionStorage.getItem("dashboard_granularity") : null) || "month") as TotalServiceGranularity;
  
  // Extra page-specific filters
  const metricMode = searchParams.get("metric") || ""; 
  const tenureFilter = urlTenure || "all";
  const displayMode = urlDisplay || "trend";

  const updateFilters = useCallback((updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(`dashboard_${key}`);
        }
      } else {
        params.set(key, String(value));
        if (typeof window !== "undefined") {
          sessionStorage.setItem(`dashboard_${key}`, String(value));
        }
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const setYear = useCallback((y: number) => updateFilters({ year: y }), [updateFilters]);
  const setCompareYear = useCallback((cy: number | null) => updateFilters({ compareYear: cy }), [updateFilters]);
  const setPovMode = useCallback((p: TotalServicePovMode) => updateFilters({ pov: p }), [updateFilters]);
  const setGranularity = useCallback((g: TotalServiceGranularity) => updateFilters({ granularity: g }), [updateFilters]);
  const setMetricMode = useCallback((m: string) => updateFilters({ metric: m }), [updateFilters]);
  const setTenureFilter = useCallback((t: string) => updateFilters({ tenure: t }), [updateFilters]);
  const setDisplayMode = useCallback((d: string) => updateFilters({ display: d }), [updateFilters]);

  return {
    year,
    compareYear,
    povMode,
    granularity,
    metricMode,
    tenureFilter,
    displayMode,
    setYear,
    setCompareYear,
    setPovMode,
    setGranularity,
    setMetricMode,
    setTenureFilter,
    setDisplayMode,
  };
}
