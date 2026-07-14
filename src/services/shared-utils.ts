import type {
  OrganizationNode,
  ServiceMonthlySnapshot,
  UserAccessScope,
} from "@/types/entities";
import {
  roundToTwo,
  calculateDeltaPercentage,
  getChangeDirection,
  normalizeServiceGroup,
  ChangeDirection,
} from "@/domain/calculators/metric-aggregation.calculator";
import {
  parseMonthlyPeriod,
  buildMonthPeriod,
  getYearFromPeriod,
  getLatestAvailableMonthInYear,
} from "@/domain/calculators/time-bucket.calculator";

export type TotalServiceChangeDirection = ChangeDirection;

export {
  roundToTwo,
  calculateDeltaPercentage,
  getChangeDirection,
  normalizeServiceGroup,
  parseMonthlyPeriod,
  buildMonthPeriod,
  getYearFromPeriod,
  getLatestAvailableMonthInYear,
};

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
  // Head office sees everything already scoped at the SQL layer (branch/region).
  if (access.role === "head_office") return snapshots;

  const nodeMap = buildNodeMap(nodes);
  return snapshots.filter((snapshot) =>
    isSnapshotVisibleToUser(snapshot, access, nodeMap)
  );
}
