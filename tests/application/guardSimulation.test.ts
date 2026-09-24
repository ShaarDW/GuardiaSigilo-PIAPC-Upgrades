import { describe, expect, it } from "vitest";
import { cellCenter, createGridMap } from "../../src/domain/model/grid";
import {
  emptyPerceptionMemory,
  rememberObservation,
} from "../../src/domain/perception/memory";
import {
  createGuardSimulation,
  updateGuardSimulation,
  type GuardFrameInput,
} from "../../src/application/simulation/guardSimulation";
import {
  GUARD_START,
  LAB_MAP,
  PATROL_POINTS,
  TILE_SIZE,
} from "../../src/application/simulation/labLevel";

function frame(overrides: Partial<GuardFrameInput> = {}): GuardFrameInput {
  return {
    timeMs: 0,
    positionCell: GUARD_START,
    arrived: false,
    visionVisible: false,
    soundHeard: false,
    memory: emptyPerceptionMemory(),
    ...overrides,
  };
}

function soundMemoryAt(cell: { x: number; y: number }): ReturnType<typeof rememberObservation> {
  return rememberObservation(emptyPerceptionMemory(), {
    source: "sound",
    position: cellCenter(cell, TILE_SIZE),
    observedAtMs: 0,
  });
}

function visionMemoryAt(cell: { x: number; y: number }): ReturnType<typeof rememberObservation> {
  return rememberObservation(emptyPerceptionMemory(), {
    source: "vision",
    position: cellCenter(cell, TILE_SIZE),
    observedAtMs: 0,
  });
}

describe("guard simulation during H4.1 (patrol only)", () => {
  it("computes a valid route to the next patrol point on start", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const outcome = updateGuardSimulation(sim, frame());

    expect(outcome.state).toBe("patrol");
    expect(outcome.events.map((event) => event.cause)).toEqual([
      "patrol-started",
      "route-replanned",
    ]);
    expect(outcome.routeCells).not.toBeNull();
    expect(outcome.goalCell).toEqual({ x: 2, y: 17 });
  });

  it("advances to the next patrol point on arrival", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    updateGuardSimulation(sim, frame());
    const arrival = updateGuardSimulation(sim, frame({ arrived: true }));

    expect(arrival.events.map((event) => event.cause)).toEqual([
      "arrived",
      "patrol-point-selected",
      "route-replanned",
    ]);
    expect(arrival.goalCell).toEqual({ x: 2, y: 4 });
  });

  it("does not double-advance while the arrival flag stays raised", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    updateGuardSimulation(sim, frame());
    updateGuardSimulation(sim, frame({ arrived: true }));
    const repeated = updateGuardSimulation(sim, frame({ arrived: true }));

    expect(repeated.events).toEqual([]);
    expect(repeated.goalCell).toEqual({ x: 2, y: 4 });
  });

  it("keeps a route without recomputing while it is still valid", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const first = updateGuardSimulation(sim, frame());

    const steady = updateGuardSimulation(sim, frame({ positionCell: { x: 25, y: 17 } }));
    expect(steady.events).toEqual([]);
    expect(steady.routeVersion).toBe(first.routeVersion);
  });

  it("skips an unreachable patrol point explicitly", () => {
    const map = createGridMap(5, 5, [{ x: 2, y: 2 }]);
    const points = [
      { x: 2, y: 2 },
      { x: 4, y: 4 },
    ];
    const sim = createGuardSimulation(map, points, { x: 1, y: 1 });
    const outcome = updateGuardSimulation(sim, frame({ positionCell: { x: 1, y: 1 } }));

    expect(outcome.events.map((event) => event.cause)).toEqual([
      "patrol-started",
      "patrol-point-skipped",
      "route-replanned",
    ]);
    expect(outcome.goalCell).toEqual({ x: 4, y: 4 });
  });

  it("wraps the cycle back to the first patrol point", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    updateGuardSimulation(sim, frame());
    updateGuardSimulation(sim, frame({ arrived: true }));
    updateGuardSimulation(sim, frame({ positionCell: { x: 2, y: 4 }, arrived: false }));
    updateGuardSimulation(sim, frame({ positionCell: { x: 2, y: 4 }, arrived: true }));
    updateGuardSimulation(sim, frame({ positionCell: { x: 27, y: 4 }, arrived: false }));
    const back = updateGuardSimulation(sim, frame({ positionCell: { x: 27, y: 4 }, arrived: true }));

    expect(back.goalCell).toEqual({ x: 27, y: 17 });
  });
});

describe("guard simulation during H4.2 (investigate)", () => {
  it("moves to the remembered sound cell when a sound is heard", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const outcome = updateGuardSimulation(
      sim,
      frame({ soundHeard: true, memory: soundMemoryAt({ x: 18, y: 10 }) }),
    );

    expect(outcome.state).toBe("investigate");
    expect(outcome.goalCell).toEqual({ x: 18, y: 10 });
    expect(outcome.events.map((event) => event.cause)).toEqual([
      "patrol-started",
      "sound-heard",
      "retargeted",
    ]);
  });

  it("re-plans toward a newer sound while already investigating", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    updateGuardSimulation(
      sim,
      frame({ soundHeard: true, memory: soundMemoryAt({ x: 18, y: 10 }) }),
    );

    const reTargeted = updateGuardSimulation(
      sim,
      frame({
        positionCell: { x: 18, y: 12 },
        soundHeard: true,
        memory: soundMemoryAt({ x: 20, y: 18 }),
      }),
    );

    expect(reTargeted.state).toBe("investigate");
    expect(reTargeted.goalCell).toEqual({ x: 20, y: 18 });
    expect(reTargeted.events.map((event) => event.cause)).toContain("retargeted");
  });

  it("returns to patrol once the target cell is reached without perception", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = soundMemoryAt({ x: 6, y: 17 });
    updateGuardSimulation(sim, frame({ soundHeard: true, memory }));

    const arrival = updateGuardSimulation(
      sim,
      frame({ positionCell: { x: 6, y: 17 }, arrived: true, memory }),
    );

    expect(arrival.state).toBe("patrol");
    expect(arrival.events.map((event) => event.cause)).toContain("investigate-arrived");
    expect(arrival.goalCell).toEqual({ x: 2, y: 17 });
  });

  it("stays investigating while a sound keeps ringing at the target", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = soundMemoryAt({ x: 6, y: 17 });
    updateGuardSimulation(sim, frame({ soundHeard: true, memory }));

    const arrival = updateGuardSimulation(
      sim,
      frame({ positionCell: { x: 6, y: 17 }, arrived: true, soundHeard: true, memory }),
    );

    expect(arrival.state).toBe("investigate");
  });

  it("abandons an unreachable investigation target and returns to patrol", () => {
    const map = createGridMap(5, 5, [{ x: 2, y: 2 }]);
    const sim = createGuardSimulation(map, [{ x: 4, y: 4 }], { x: 1, y: 1 });
    const memory = soundMemoryAt({ x: 2, y: 2 });

    const outcome = updateGuardSimulation(
      sim,
      frame({ positionCell: { x: 1, y: 1 }, soundHeard: true, memory }),
    );

    expect(outcome.events.map((event) => event.cause)).toEqual([
      "patrol-started",
      "sound-heard",
      "goal-unreachable",
      "route-replanned",
    ]);
    expect(outcome.state).toBe("patrol");
    expect(outcome.goalCell).toEqual({ x: 4, y: 4 });
  });
});

describe("guard simulation during H4.3 (pursue)", () => {
  it("starts pursuing toward the visible player cell", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = visionMemoryAt({ x: 20, y: 18 });
    const outcome = updateGuardSimulation(
      sim,
      frame({ visionVisible: true, memory }),
    );

    expect(outcome.state).toBe("pursue");
    expect(outcome.goalCell).toEqual({ x: 20, y: 18 });
    expect(outcome.events.map((event) => event.cause)).toEqual([
      "patrol-started",
      "vision-acquired",
      "route-replanned",
    ]);
  });

  it("does not recompute the route on every frame toward a stationary target", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = visionMemoryAt({ x: 20, y: 18 });

    let outcome = updateGuardSimulation(
      sim,
      frame({ timeMs: 0, visionVisible: true, memory }),
    );
    expect(outcome.routeComputations).toBe(1);

    for (let frameIndex = 1; frameIndex < 10; frameIndex += 1) {
      outcome = updateGuardSimulation(
        sim,
        frame({ timeMs: 16 * frameIndex, visionVisible: true, memory }),
      );
      expect(outcome.routeComputations).toBe(1);
      expect(outcome.events).toEqual([]);
    }
  });

  it("recomputes only when the replan interval elapses", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = visionMemoryAt({ x: 20, y: 18 });

    const initial = updateGuardSimulation(
      sim,
      frame({ timeMs: 0, visionVisible: true, memory }),
    );
    expect(initial.routeComputations).toBe(1);

    const withinInterval = updateGuardSimulation(
      sim,
      frame({ timeMs: 240, visionVisible: true, memory }),
    );
    expect(withinInterval.routeComputations).toBe(1);

    const onInterval = updateGuardSimulation(
      sim,
      frame({ timeMs: 250, visionVisible: true, memory }),
    );
    expect(onInterval.routeComputations).toBe(2);

    const nextWithin = updateGuardSimulation(
      sim,
      frame({ timeMs: 370, visionVisible: true, memory }),
    );
    expect(nextWithin.routeComputations).toBe(2);

    const nextOnInterval = updateGuardSimulation(
      sim,
      frame({ timeMs: 500, visionVisible: true, memory }),
    );
    expect(nextOnInterval.routeComputations).toBe(3);
  });

  it("re-plans immediately when the player moves to a new cell", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    updateGuardSimulation(
      sim,
      frame({ timeMs: 0, visionVisible: true, memory: visionMemoryAt({ x: 20, y: 18 }) }),
    );

    const changed = updateGuardSimulation(
      sim,
      frame({ timeMs: 16, visionVisible: true, memory: visionMemoryAt({ x: 22, y: 18 }) }),
    );

    expect(changed.state).toBe("pursue");
    expect(changed.goalCell).toEqual({ x: 22, y: 18 });
    expect(changed.routeComputations).toBe(2);
    expect(changed.events.map((event) => event.cause)).toEqual(["route-replanned"]);
    expect(changed.routeVersion).toBe(2);
  });

  it("keeps pursuing during the vision grace period", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = visionMemoryAt({ x: 20, y: 18 });
    updateGuardSimulation(sim, frame({ timeMs: 0, visionVisible: true, memory }));

    const withinGrace = updateGuardSimulation(
      sim,
      frame({ timeMs: 100, positionCell: { x: 25, y: 18 }, memory }),
    );

    expect(withinGrace.state).toBe("pursue");
  });

  it("moves to investigate after the grace period, preserving the last known cell", () => {
    const sim = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
    const memory = visionMemoryAt({ x: 20, y: 18 });
    updateGuardSimulation(sim, frame({ timeMs: 0, visionVisible: true, memory }));

    const lost = updateGuardSimulation(
      sim,
      frame({ timeMs: 500, positionCell: { x: 22, y: 18 }, memory }),
    );

    expect(lost.state).toBe("investigate");
    expect(lost.goalCell).toEqual({ x: 20, y: 18 });
    expect(lost.events.map((event) => event.cause)).toEqual(["vision-lost", "retargeted"]);
  });
});