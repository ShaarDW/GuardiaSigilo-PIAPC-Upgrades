import type { GridPoint } from "../model/grid";

export function nextPatrolIndex(pointCount: number, currentIndex: number): number {
  if (!Number.isInteger(pointCount) || pointCount <= 0) {
    throw new Error("Patrol point count must be a positive integer.");
  }
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= pointCount) {
    throw new Error("Patrol index is outside the point list.");
  }
  return (currentIndex + 1) % pointCount;
}

export function patrolPointAt(
  points: readonly GridPoint[],
  index: number,
): GridPoint {
  if (!Number.isInteger(index) || index < 0 || index >= points.length) {
    throw new Error("Patrol index is outside the point list.");
  }
  const point = points[index];
  if (!point) {
    throw new Error("Patrol point invariant failed.");
  }
  return point;
}