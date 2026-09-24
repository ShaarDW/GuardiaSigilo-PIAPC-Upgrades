import { describe, expect, it } from "vitest";
import { isWalkable, type GridPoint } from "../../src/domain/model/grid";
import { findPathAStar } from "../../src/domain/navigation/search";
import { nextPatrolIndex, patrolPointAt } from "../../src/domain/behavior/patrol";
import { GUARD_START, LAB_MAP, PATROL_POINTS } from "../../src/application/simulation/labLevel";

describe("patrol points on the lab map", () => {
  it("keeps every patrol point walkable", () => {
    for (const point of PATROL_POINTS) {
      expect(isWalkable(LAB_MAP, point)).toBe(true);
    }
  });

  it("reaches every consecutive pair of the cycle (including wrap-around)", () => {
    const count = PATROL_POINTS.length;
    for (let i = 0; i < count; i += 1) {
      const from = PATROL_POINTS[i] as GridPoint;
      const to = PATROL_POINTS[(i + 1) % count] as GridPoint;
      const result = findPathAStar(LAB_MAP, from, to);
      expect(result.status, `segmento ${from.x},${from.y} -> ${to.x},${to.y}`).toBe("success");
    }
  });

  it("starts at the guard start point", () => {
    expect(PATROL_POINTS[0]).toEqual(GUARD_START);
  });
});

describe("patrol index selection", () => {
  it("cycles the destination index forward with wrap-around", () => {
    expect(nextPatrolIndex(4, 1)).toBe(2);
    expect(nextPatrolIndex(4, 2)).toBe(3);
    expect(nextPatrolIndex(4, 3)).toBe(0);
    expect(nextPatrolIndex(4, 0)).toBe(1);
  });

  it("returns the only point for a single-point patrol", () => {
    expect(nextPatrolIndex(1, 0)).toBe(0);
  });

  it("rejects invalid counts and indexes", () => {
    expect(() => nextPatrolIndex(0, 0)).toThrow("Patrol point count");
    expect(() => nextPatrolIndex(4, 4)).toThrow("Patrol index");
    expect(() => nextPatrolIndex(Number.NaN, 0)).toThrow("Patrol point count");
  });

  it("patrolPointAt returns the cell at a valid index and rejects others", () => {
    expect(patrolPointAt(PATROL_POINTS, 1)).toEqual({ x: 2, y: 17 });
    expect(() => patrolPointAt(PATROL_POINTS, 9)).toThrow("Patrol index");
  });
});