import type {
  OrganizationNode,
  ServiceMonthlySnapshot,
  UserAccessScope,
} from "@/types/entities";

export type TotalServiceChangeDirection = "up" | "down" | "flat";

const UNMAPPED_SERVICE_GROUP = "Unmapped";

/**
 * Rounds a number to two decimal places.
 */
export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates percentage delta change between current and previous values.
 */
export function calculateDeltaPercentage(
  currentValue: number,
  previousValue: number
): number | null {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : null;
  }
  return roundToTwo(((currentValue - previousValue) / previousValue) * 100);
}

/**
 * Translates numeric delta into standard change direction string.
 */
export function getChangeDirection(delta: number): TotalServiceChangeDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * Standardizes unassigned or empty service groups.
 */
export function normalizeServiceGroup(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : UNMAPPED_SERVICE_GROUP;
}

/**
 * Parses dynamic YYYY-MM period strings.
 */
export function parseMonthlyPeriod(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

/**
 * Formats YYYY-MM period strings cleanly.
 */
export function buildMonthPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Extracts numeric year from dynamic period string.
 */
export function getYearFromPeriod(period: string): number | null {
  const parsed = parseMonthlyPeriod(period);
  if (!parsed) return null;
  return parsed.year;
}

/**
 * Finds the latest available month with data in snapshots for a specific year.
 */
export function getLatestAvailableMonthInYear(
  snapshots: ServiceMonthlySnapshot[],
  year: number
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
 * Indexes organization nodes for O(1) visibility checks.
 */
export function buildNodeMap(
  nodes: OrganizationNode[]
): Map<string, OrganizationNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/**
 * Determines whether a given node is a child/descendant of another node.
 */
export function isDescendantOf(
  nodeId: string,
  ancestorId: string,
  nodeMap: Map<string, OrganizationNode>
): boolean {
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true;
    }
    current = nodeMap.get(current.parentId);
  }
  return false;
}

/**
 * Evaluates node visibility based on user access scopes.
 */
export function isNodeVisibleToUser(
  nodeId: string | null | undefined,
  access: UserAccessScope,
  nodeMap: Map<string, OrganizationNode>
): boolean {
  if (!nodeId) return false;
  const visibleNodeIds = new Set([
    access.organizationNodeId,
    ...access.visibleNodeIds,
  ]);
  if (visibleNodeIds.has(nodeId)) return true;
  return isDescendantOf(nodeId, access.organizationNodeId, nodeMap);
}

/**
 * Evaluates snapshot visibility based on hierarchy nodes.
 */
export function isSnapshotVisibleToUser(
  snapshot: ServiceMonthlySnapshot,
  access: UserAccessScope,
  nodeMap: Map<string, OrganizationNode>
): boolean {
  return (
    isNodeVisibleToUser(snapshot.amId, access, nodeMap) ||
    isNodeVisibleToUser(snapshot.leadId, access, nodeMap) ||
    isNodeVisibleToUser(snapshot.branchId, access, nodeMap)
  );
}

/**
 * Filters standard snapshots to those accessible under active role scope boundaries.
 */
export function applyRoleScope(
  snapshots: ServiceMonthlySnapshot[],
  access: UserAccessScope,
  nodes: OrganizationNode[]
): ServiceMonthlySnapshot[] {
  const nodeMap = buildNodeMap(nodes);
  return snapshots.filter((snapshot) =>
    isSnapshotVisibleToUser(snapshot, access, nodeMap)
  );
}
