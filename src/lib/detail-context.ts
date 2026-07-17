import { MONTH_NAMES_FULL_ID, MONTH_NAMES_SHORT_ID } from "@/domain/constants";

/** Indonesian label for a drill-down hierarchy level. */
export function levelLabelId(level: string | null | undefined): string | null {
  switch (level) {
    case "branch":
      return "Cabang";
    case "service_group":
      return "Grup Layanan";
    case "lead_am":
      return "Manajer";
    case "am":
      return "AM";
    case "service":
      return "Layanan";
    case "customer":
      return "Pelanggan";
    case "revenue_gap":
      return "Kesenjangan";
    default:
      return null;
  }
}

/**
 * Human label for a clicked bucket key (`2025-06`, `2025-Q2`, `2025-S1`,
 * `2025`) or the whole-year fallback when no specific bucket was clicked.
 */
export function periodLabelId(bucketKey: string | null | undefined, year: number): string {
  if (!bucketKey) return `Semua bulan ${year}`;

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(bucketKey);
  if (monthMatch) {
    const monthIdx = Number(monthMatch[2]) - 1;
    const short = MONTH_NAMES_SHORT_ID[monthIdx];
    return `${short ? MONTH_NAMES_FULL_ID[short] ?? short : bucketKey} ${monthMatch[1]}`;
  }

  const quarterMatch = /^(\d{4})-Q(\d)$/.exec(bucketKey);
  if (quarterMatch) return `Kuartal ${quarterMatch[2]} ${quarterMatch[1]}`;

  const semesterMatch = /^(\d{4})-S(\d)$/.exec(bucketKey);
  if (semesterMatch) return `Semester ${semesterMatch[2]} ${semesterMatch[1]}`;

  if (/^\d{4}$/.test(bucketKey)) return `Tahun ${bucketKey}`;
  return bucketKey;
}
