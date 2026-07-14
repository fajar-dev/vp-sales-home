import type {
  ServiceMonthlySnapshot,
  TotalServiceGranularity,
} from "@/types/entities";
import { MONTH_NAMES_SHORT_ID } from "../constants";

export interface TimeBucketConfig {
  key: string;
  label: string;
  startPeriod: string;
  endPeriod: string;
  periods: string[];
  monthNumbers: number[];
  hasData: boolean;
  isInProgress: boolean;
}

/** `MMYY` (billing) -> `YYYY-MM` (frontend). Assumes 20xx. */
export function billingPeriodToIso(period: string): string {
  const mm = period.slice(0, 2);
  const yy = period.slice(2, 4);
  return `20${yy}-${mm}`;
}

/** `YYYY-MM` -> `MMYY`. */
export function isoPeriodToBilling(iso: string): string {
  const [year, month] = iso.split("-");
  return `${month}${year.slice(2)}`;
}

export function isActiveStatus(code: string): boolean {
  return code === "AC" || code === "FR";
}

export function isChurnStatus(code: string): boolean {
  return code === "BL" || code === "NA";
}

/**
 * Parses dynamic YYYY-MM period strings into year and month numbers.
 */
export function parseMonthlyPeriod(
  period: string,
): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

/**
 * Formats year and month numbers into standard YYYY-MM period string.
 */
export function buildMonthPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Extracts numeric year from a YYYY-MM period string.
 */
export function getYearFromPeriod(period: string): number | null {
  const parsed = parseMonthlyPeriod(period);
  return parsed ? parsed.year : null;
}

/**
 * Calculates month difference between p1 and p2 (format: YYYY-MM)
 */
export function diffInMonths(p1: string, p2: string): number {
  const [y1, m1] = p1.split("-").map(Number);
  const [y2, m2] = p2.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * Finds the latest available month with data in snapshots for a specific year.
 */
export function getLatestAvailableMonthInYear(
  snapshots: ServiceMonthlySnapshot[],
  year: number,
): number | null {
  const months = snapshots
    .map((snapshot) => {
      const parsed = parseMonthlyPeriod(snapshot.period);
      if (!parsed || parsed.year !== year) return null;
      return parsed.month;
    })
    .filter((month): month is number => month !== null);

  if (months.length === 0) return null;
  return Math.max(...months);
}

/**
 * Builds time buckets for the requested granularity and year, detecting data availability and in-progress status.
 */
export function buildTimeBuckets(
  granularity: TotalServiceGranularity,
  year: number,
  snapshots: ServiceMonthlySnapshot[] = [],
): TimeBucketConfig[] {
  const latestAvailableMonth = getLatestAvailableMonthInYear(snapshots, year);

  const rawConfigs: Array<{
    key: string;
    label: string;
    monthNumbers: number[];
  }> =
    granularity === "month"
      ? Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          return {
            key: buildMonthPeriod(year, month),
            label: MONTH_NAMES_SHORT_ID[index],
            monthNumbers: [month],
          };
        })
      : granularity === "quarter"
        ? [
            { key: `${year}-Q1`, label: "Kuartal 1", monthNumbers: [1, 2, 3] },
            { key: `${year}-Q2`, label: "Kuartal 2", monthNumbers: [4, 5, 6] },
            { key: `${year}-Q3`, label: "Kuartal 3", monthNumbers: [7, 8, 9] },
            { key: `${year}-Q4`, label: "Kuartal 4", monthNumbers: [10, 11, 12] },
          ]
        : granularity === "semester"
          ? [
              {
                key: `${year}-S1`,
                label: "Semester 1",
                monthNumbers: [1, 2, 3, 4, 5, 6],
              },
              {
                key: `${year}-S2`,
                label: "Semester 2",
                monthNumbers: [7, 8, 9, 10, 11, 12],
              },
            ]
          : [
              {
                key: String(year),
                label: String(year),
                monthNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
              },
            ];

  return rawConfigs.map((bucket) => {
    const periods = bucket.monthNumbers.map((m) => buildMonthPeriod(year, m));
    const startMonth = bucket.monthNumbers[0];
    const endMonth = bucket.monthNumbers[bucket.monthNumbers.length - 1];

    const hasData =
      snapshots.length === 0 ||
      bucket.monthNumbers.some(
        (month) =>
          latestAvailableMonth !== null && month <= latestAvailableMonth,
      );

    const isInProgress =
      latestAvailableMonth !== null &&
      latestAvailableMonth >= startMonth &&
      latestAvailableMonth < endMonth;

    return {
      key: bucket.key,
      label: bucket.label,
      startPeriod: buildMonthPeriod(year, startMonth),
      endPeriod: buildMonthPeriod(year, endMonth),
      periods,
      monthNumbers: bucket.monthNumbers,
      hasData,
      isInProgress,
    };
  });
}

/**
 * Returns the time bucket configuration for the period preceding the current year's granularity window.
 */
export function getPreviousBucket(
  granularity: TotalServiceGranularity,
  year: number,
): TimeBucketConfig {
  const prevYear = year - 1;
  let key: string;
  let label: string;
  let monthNumbers: number[];

  switch (granularity) {
    case "month":
      key = buildMonthPeriod(prevYear, 12);
      label = "Des " + prevYear;
      monthNumbers = [12];
      break;
    case "quarter":
      key = `${prevYear}-Q4`;
      label = "Kuartal 4 " + prevYear;
      monthNumbers = [10, 11, 12];
      break;
    case "semester":
      key = `${prevYear}-S2`;
      label = "Semester 2 " + prevYear;
      monthNumbers = [7, 8, 9, 10, 11, 12];
      break;
    case "year":
      key = String(prevYear);
      label = String(prevYear);
      monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      break;
  }

  const periods = monthNumbers.map((m) => buildMonthPeriod(prevYear, m));

  return {
    key,
    label,
    startPeriod: periods[0],
    endPeriod: periods[periods.length - 1],
    periods,
    monthNumbers,
    hasData: true,
    isInProgress: false,
  };
}
