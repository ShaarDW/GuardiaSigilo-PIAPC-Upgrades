import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../src/domain/behavior/searchPlan";
import { cellKey, createGridMap, isWalkable } from "../../src/domain/model/grid";
import { manhattanDistance } from "../../src/domain/navigation/gridGraph";
import { LAB_MAP } from "../../src/application/simulation/labLevel";

const OPTIONS = { radiusCells: 3, waypointsMax: 16 };

describe("buildSearchPlan", () => {
  it("generates a finite plan around the LKP", () => {
    const plan = buildSearchPlan({ x: 18, y: 17 }, LAB_MAP, OPTIONS);

    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(16);
  });

  it("keeps every waypoint within the radius of 3 cells from the LKP", () => {
    const lkp = { x: 18, y: 17 };
    const plan = buildSearchPlan(lkp, LAB_MAP, OPTIONS);

    for (const waypoint of plan) {
      expect(manhattanDistance(lkp, waypoint)).toBeLessThanOrEqual(3);
      expect(manhattanDistance(lkp, waypoint)).toBeGreaterThan(0);
    }
  });

  it("uses only walkable cells", () => {
    const plan = buildSearchPlan({ x: 18, y: 17 }, LAB_MAP, OPTIONS);

    for (const waypoint of plan) {
      expect(isWalkable(LAB_MAP, waypoint)).toBe(true);
    }
  });

  it("never exceeds the 16 waypoint cap", () => {
    const openMap = createGridMap(9, 9, []);
    const plan = buildSearchPlan({ x: 4, y: 4 }, openMap, OPTIONS);

    expect(plan.length).toBeLessThanOrEqual(16);
  });

  it("orders waypoints by increasing Manhattan distance, breaking ties deterministically", () => {
    const lkp = { x: 18, y: 17 };
    const plan = buildSearchPlan(lkp, LAB_MAP, OPTIONS);

    const sortedCopy = [...plan].sort((left, right) => {
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

    expect(plan).toEqual(sortedCopy);
  });

  it("has no duplicate waypoints", () => {
    const plan = buildSearchPlan({ x: 18, y: 17 }, LAB_MAP, OPTIONS);

    const unique = new Set(plan.map((waypoint) => cellKey(waypoint)));
    expect(unique.size).toBe(plan.length);
  });

  it("returns an empty plan when no in-radius cell is walkable", () => {
    const isolatedMap = createGridMap(1, 1, []);
    const plan = buildSearchPlan({ x: 0, y: 0 }, isolatedMap, OPTIONS);

    expect(plan).toEqual([]);
  });
});