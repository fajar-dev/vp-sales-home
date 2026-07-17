import {
  ServiceMonthlySnapshot,
  OrganizationNode,
  TotalServiceGranularity,
  TotalServiceRowLevel,
  RevenueMatrixRow,
} from "@/types/entities";

/**
 * Helper function to format IDR elegantly with dots
 */
export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Dynamic periods configuration builder (months, quarters, semesters, years)
 */
export function buildTimeBuckets(
  granularity: TotalServiceGranularity,
  year: number
) {
  return granularity === "month"
    ? Array.from({ length: 12 }, (_, i) => ({
        key: `${year}-${String(i + 1).padStart(2, "0")}`,
        label: new Date(year, i, 1).toLocaleDateString("id-ID", { month: "short" }),
        periods: [`${year}-${String(i + 1).padStart(2, "0")}`],
      }))
    : granularity === "quarter"
      ? [
          { key: `${year}-Q1`, label: "Kuartal 1", periods: [`${year}-01`, `${year}-02`, `${year}-03`] },
          { key: `${year}-Q2`, label: "Kuartal 2", periods: [`${year}-04`, `${year}-05`, `${year}-06`] },
          { key: `${year}-Q3`, label: "Kuartal 3", periods: [`${year}-07`, `${year}-08`, `${year}-09`] },
          { key: `${year}-Q4`, label: "Kuartal 4", periods: [`${year}-10`, `${year}-11`, `${year}-12`] },
        ]
      : granularity === "semester"
        ? [
            { key: `${year}-S1`, label: "Semester 1", periods: [`${year}-01`, `${year}-02`, `${year}-03`, `${year}-04`, `${year}-05`, `${year}-06`] },
            { key: `${year}-S2`, label: "Semester 2", periods: [`${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`] },
          ]
        : [
            { key: String(year), label: String(year), periods: [`${year}-01`, `${year}-02`, `${year}-03`, `${year}-04`, `${year}-05`, `${year}-06`, `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`] },
          ];
}

/**
 * Calculates total expected or actual revenue sum for a set of snapshots in a period/bucket list
 */
export function getMetricValueForBucket(
  snapshots: ServiceMonthlySnapshot[],
  periodsList: string[],
  metricType: "expected" | "actual" = "expected"
): number {
  const bucketSnaps = snapshots.filter((s) => periodsList.includes(s.period));
  return bucketSnaps.reduce((total, s) => {
    return total + (metricType === "expected" ? s.expectedRevenue : s.actualRevenue);
  }, 0);
}


/**
 * Recursive tree builder for hierarchical branch -> lead -> am rows dikonsumsi MatrixTable
 */
function getRevenueRowDescriptor(
  snapshot: ServiceMonthlySnapshot,
  level: TotalServiceRowLevel,
  nodeMap: Map<string, OrganizationNode>
): { id: string; label: string; parentId: string | null } {
  if (level === "branch") {
    return {
      id: snapshot.branchId,
      label: nodeMap.get(snapshot.branchId)?.name ?? snapshot.branchId,
      parentId: null,
    };
  }

  if (level === "service_group") {
    const serviceGroup = snapshot.serviceGroup?.trim() || "Unmapped";
    return {
      id: serviceGroup,
      label: serviceGroup,
      parentId: snapshot.branchId,
    };
  }

  if (level === "lead_am") {
    const leadId = snapshot.leadId ?? "unassigned-lead";
    return {
      id: leadId,
      label: leadId === "unassigned-lead"
        ? "Unassigned Lead"
        : nodeMap.get(leadId)?.name ?? leadId,
      parentId: snapshot.branchId,
    };
  }

  if (level === "am") {
    const amId = snapshot.amId ?? "unassigned-am";
    return {
      id: amId,
      label: amId === "unassigned-am"
        ? "Unassigned AM"
        : nodeMap.get(amId)?.name ?? amId,
      parentId: snapshot.leadId ?? snapshot.branchId,
    };
  }

  if (level === "service") {
    return {
      id: snapshot.productServiceId,
      label: snapshot.serviceType,
      parentId: snapshot.amId ?? snapshot.branchId,
    };
  }

  // customer
  return {
    id: snapshot.custId,
    label: snapshot.custId,
    parentId: snapshot.productServiceId,
  };
}

export function buildRevenueRows(
  snaps: ServiceMonthlySnapshot[],
  timeBuckets: Array<{ key: string; label: string; periods: string[] }>,
  baselinePeriods: string[],
  compareYear: number | null,
  mockOrganizationNodes: OrganizationNode[],
  metricType: "expected" | "actual" = "expected",
  level: TotalServiceRowLevel = "branch",
  parentId: string | null = null,
  povMode: "sales" | "operational" = "sales",
  parentPathId: string = ""
): RevenueMatrixRow[] {
  const nodeMap = new Map(mockOrganizationNodes.map((n) => [n.id, n]));

  // Group snaps by descriptor ID for the current level
  const grouped = new Map<string, ServiceMonthlySnapshot[]>();
  const meta = new Map<string, { label: string; parentId: string | null }>();

  for (const snapshot of snaps) {
    const descriptor = getRevenueRowDescriptor(snapshot, level, nodeMap);
    const items = grouped.get(descriptor.id) ?? [];
    items.push(snapshot);
    grouped.set(descriptor.id, items);

    if (!meta.has(descriptor.id)) {
      meta.set(descriptor.id, {
        label: descriptor.label,
        parentId: descriptor.parentId,
      });
    }
  }

  // Customer level is served by the detail modal, not the matrix tree.
  const operationalFlow: TotalServiceRowLevel[] = ["branch", "service_group", "service"];
  const salesFlow: TotalServiceRowLevel[] = ["branch", "lead_am", "am", "service"];
  const flow = povMode === "operational" ? operationalFlow : salesFlow;
  const index = flow.indexOf(level);
  const nextLevel = (index === -1 || index === flow.length - 1) ? null : flow[index + 1];

  return Array.from(grouped.entries())
    .map(([id, rowSnaps]) => {
      // Calculate cell value per time bucket
      let previousValue = getMetricValueForBucket(rowSnaps, baselinePeriods, metricType);
      const cells = timeBuckets.map((bucket) => {
        const value = getMetricValueForBucket(rowSnaps, bucket.periods, metricType);

        let compValue: number | null = null;
        if (compareYear !== null) {
          const comparisonPeriods = bucket.periods.map((period) => {
            const parts = period.split("-");
            if (parts.length < 2) return String(compareYear);
            return `${compareYear}-${parts[1]}`;
          });
          compValue = getMetricValueForBucket(rowSnaps, comparisonPeriods, metricType);
        } else {
          compValue = previousValue;
        }

        const deltaValue = compValue === null ? 0 : value - compValue;
        const deltaPercentage =
          compValue === 0 || compValue === null
            ? 0
            : Math.round((deltaValue / compValue) * 100);
        previousValue = value;

        return {
          bucketKey: bucket.key,
          value,
          deltaValue,
          deltaPercentage,
        };
      });

      const latestValue = cells.at(-1)?.value ?? 0;
      const rowMeta = meta.get(id);

      const uniqueId = parentPathId ? `${parentPathId}_${id}` : id;

      const children = nextLevel
        ? buildRevenueRows(
            rowSnaps,
            timeBuckets,
            baselinePeriods,
            compareYear,
            mockOrganizationNodes,
            metricType,
            nextLevel,
            id,
            povMode,
            uniqueId
          )
        : [];

      const totalAcrossBuckets = cells.reduce((sum, c) => sum + c.value, 0);

      return {
        id: uniqueId,
        baseId: id,
        label: rowMeta?.label ?? id,
        level,
        parentId: rowMeta?.parentId ?? parentId,
        latestValue,
        totalAcrossBuckets,
        cells,
        children,
      };
    })
    .filter((r) => r.cells.some((c) => c.value > 0))
    .sort((a, b) => a.label.localeCompare(b.label));
}

