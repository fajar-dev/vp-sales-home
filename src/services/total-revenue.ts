import {
  ServiceMonthlySnapshot,
  OrganizationNode,
  TotalServiceGranularity,
  TotalServiceRowLevel,
} from "@/types/entities";

// Financial multipliers
export const REALIZED_REVENUE_FACTOR = 0.985;
export const REVENUE_GAP_FACTOR = 0.015;

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
      id: snapshot.serviceId,
      label: snapshot.serviceId,
      parentId: snapshot.amId ?? snapshot.branchId,
    };
  }

  // category
  return {
    id: "category",
    label: "Category",
    parentId: snapshot.serviceId,
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
): any[] {
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

  const operationalFlow: TotalServiceRowLevel[] = ["branch", "service_group", "service", "category"];
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

      return {
        id: uniqueId,
        baseId: id,
        label: rowMeta?.label ?? id,
        level,
        latestValue,
        cells,
        children,
      };
    })
    .filter((r) => r.cells.some((c) => c.value > 0))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Prepares enriched snapshot data for detailed drilldown table modals
 */
export function getEnrichedRowsForModal(
  detailModal: { isOpen: boolean; entityId: string | null; level: string | null; period: string | null },
  year: number,
  timeBuckets: Array<{ key: string; label: string; periods: string[] }>,
  scopedSnapshots: ServiceMonthlySnapshot[],
  mockOrganizationNodes: OrganizationNode[]
): any[] {
  if (!detailModal.isOpen || !detailModal.entityId || !detailModal.level) return [];

  let targetPeriods: string[] = [];
  if (detailModal.period) {
    const bucket = timeBuckets.find((b) => b.key === detailModal.period);
    if (bucket) {
      targetPeriods = bucket.periods;
    } else {
      targetPeriods = [detailModal.period];
    }
  }

  const relevantSnapshots = scopedSnapshots.filter((s) => {
    if (targetPeriods.length > 0) {
      if (!targetPeriods.includes(s.period)) return false;
    } else {
      if (!s.period.startsWith(String(year))) return false;
    }

    if (detailModal.level === "branch") return s.branchId === detailModal.entityId;
    if (detailModal.level === "lead_am") return s.leadId === detailModal.entityId;
    if (detailModal.level === "am") return s.amId === detailModal.entityId;
    if (detailModal.level === "service_group") return s.serviceGroup === detailModal.entityId;
    if (detailModal.level === "service") return s.serviceId === detailModal.entityId;
    if (detailModal.level === "revenue_gap") return s.isActiveEndOfPeriod && !s.isPaidInPeriod;
    return true;
  });

  const nodeMap = new Map(mockOrganizationNodes.map((n) => [n.id, n]));

  if (detailModal.level === "revenue_gap") {
    // Return all active unpaid monthly snapshots chronologically
    return relevantSnapshots
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((snapshot) => {
        const idNumber = snapshot.serviceId.split("-")[1] || "000";
        return {
          serviceId: snapshot.serviceId,
          customerName: `Customer ${idNumber}`,
          serviceName: `Service Package ${idNumber}`,
          branchName: nodeMap.get(snapshot.branchId)?.name ?? null,
          leadName: snapshot.leadId ? nodeMap.get(snapshot.leadId)?.name ?? null : null,
          amName: snapshot.amId ? nodeMap.get(snapshot.amId)?.name ?? null : null,
          serviceGroup: snapshot.serviceGroup,
          installationAddress: `Jalan Sudirman No. ${idNumber}, Kota ${
            nodeMap.get(snapshot.branchId)?.name ?? "Unknown"
          }`,
          generatedAt: snapshot.generatedAt,
          currentStatus: snapshot.isChurnedInPeriod
            ? "churned"
            : snapshot.isActiveEndOfPeriod
            ? "active"
            : "inactive",
          currentTotalActive: snapshot.activeServiceCount,
          bandwidthMbps:
            parseInt(idNumber) % 3 === 0 ? 100 : parseInt(idNumber) % 2 === 0 ? 50 : 20,
          expectedRevenue: snapshot.expectedRevenue,
          period: snapshot.period,
          invoiceNumber: `INV-${snapshot.period.replace("-", "")}-${idNumber}`,
          receiptNumber: null,
          activeDate: `2024-${String(((parseInt(idNumber) || 1) % 12) + 1).padStart(2, "0")}-10`,
        };
      });
  }

  const latestSnapshotsMap = new Map<string, ServiceMonthlySnapshot>();
  relevantSnapshots.forEach((s) => {
    const existing = latestSnapshotsMap.get(s.serviceId);
    if (!existing || s.period > existing.period) {
      if (s.expectedRevenue > 0) {
        latestSnapshotsMap.set(s.serviceId, s);
      }
    }
  });

  const filteredSnapshots = Array.from(latestSnapshotsMap.values());

  return filteredSnapshots.map((snapshot) => {
    const idNumber = snapshot.serviceId.split("-")[1] || "000";
    return {
      serviceId: snapshot.serviceId,
      customerName: `Customer ${idNumber}`,
      serviceName: `Service Package ${idNumber}`,
      branchName: nodeMap.get(snapshot.branchId)?.name ?? null,
      leadName: snapshot.leadId ? nodeMap.get(snapshot.leadId)?.name ?? null : null,
      amName: snapshot.amId ? nodeMap.get(snapshot.amId)?.name ?? null : null,
      serviceGroup: snapshot.serviceGroup,
      installationAddress: `Jalan Sudirman No. ${idNumber}, Kota ${
        nodeMap.get(snapshot.branchId)?.name ?? "Unknown"
      }`,
      generatedAt: snapshot.generatedAt,
      currentStatus: snapshot.isChurnedInPeriod
        ? "churned"
        : snapshot.isActiveEndOfPeriod
        ? "active"
        : "inactive",
      currentTotalActive: snapshot.activeServiceCount,
      bandwidthMbps:
        parseInt(idNumber) % 3 === 0 ? 100 : parseInt(idNumber) % 2 === 0 ? 50 : 20,
      expectedRevenue: snapshot.expectedRevenue,
      period: snapshot.period,
      invoiceNumber: `INV-${snapshot.period.replace("-", "")}-${idNumber}`,
      receiptNumber: snapshot.isPaidInPeriod ? `REC-${snapshot.period.replace("-", "")}-${idNumber}` : null,
      activeDate: `2024-${String(((parseInt(idNumber) || 1) % 12) + 1).padStart(2, "0")}-10`,
    };
  });
}
