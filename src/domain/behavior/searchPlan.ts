import { isWalkable, type GridMap, type GridPoint } from "../model/grid";
import { manhattanDistance } from "../navigation/gridGraph";

export interface SearchPlanOptions {
  readonly radiusCells: number;
  readonly waypointsMax: number;
}

export function buildSearchPlan(
  lkp: GridPoint,
  map: GridMap,
  options: SearchPlanOptions,
): readonly GridPoint[] {
  if (Number.isFinite(options.radiusCells) && options.radiusCells > 0) {
    if (!Number.isInteger(options.radiusCells)) {
      throw new Error("Search radius must be an integer.");
    }
  } else {
    throw new Error("Search radius must be a positive integer.");
  }
  if (Number.isFinite(options.waypointsMax) && options.waypointsMax > 0) {
    if (!Number.isInteger(options.waypointsMax)) {
      throw new Error("Waypoint limit must be an integer.");
    }
  } else {
    throw new Error("Waypoint limit must be a positive integer.");
  }
  if (!isWalkable(map, lkp)) {
    throw new Error(`Search center is not walkable: (${lkp.x},${lkp.y}).`);
  }

  const candidates: GridPoint[] = [];

  for (let dy = -options.radiusCells; dy <= options.radiusCells; dy += 1) {
    for (let dx = -options.radiusCells; dx <= options.radiusCells; dx += 1) {
      const cell = { x: lkp.x + dx, y: lkp.y + dy };
      const distance = manhattanDistance(lkp, cell);
      if (distance < 1 || distance > options.radiusCells) {
        continue;
      }
      if (!isWalkable(map, cell)) {
        continue;
      }
      candidates.push(cell);
    }
  }

  candidates.sort((left, right) => {
    const leftDistance = manhattanDistance(lkp, left);
    const rightDistance = manhattanDistance(lkp, right);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    return left.y - right.y;
  });

  return candidates.slice(0, options.waypointsMax);
}