import { describe, expect, it } from "vitest";
import {
  ALERT_MAX,
  alertBand,
  alertTarget,
  resolveAlert,
  RISE_RATE_PER_MS,
  type AlertMeterState,
} from "../../../src/game/visual/alertMeter";

function at(pattern: AlertMeterState): AlertMeterState {
  return {
    value: pattern.value,
    updatedAtMs: pattern.updatedAtMs,
  };
}

describe("alert target derivation (base)", () => {
  it("reports calm targets for patrol", () => {
    expect(alertTarget({ state: "patrol", visionVisible: false })).toBe(0);
  });

  it("reports dissolving tension for return", () => {
    expect(alertTarget({ state: "return", visionVisible: false })).toBe(40);
  });

  it("reports rising tension for investigate and search", () => {
    expect(alertTarget({ state: "investigate", visionVisible: false })).toBe(70);
    expect(alertTarget({ state: "search", visionVisible: false })).toBe(80);
  });

  it("reports maximum tension for pursue", () => {
    expect(alertTarget({ state: "pursue", visionVisible: false })).toBe(ALERT_MAX);
  });

  it("forces maximum tension whenever the player is visible", () => {
    expect(alertTarget({ state: "patrol", visionVisible: true })).toBe(ALERT_MAX);
  });
});

describe("A — calm", () => {
  it("starts at zero alert with no previous state", () => {
    const state = resolveAlert(null, { state: "patrol", visionVisible: false }, 0);
    expect(state.value).toBe(0);
  });

  it("stays at zero while patrolling", () => {
    const state = resolveAlert(null, { state: "patrol", visionVisible: false }, 10);
    const later = resolveAlert(state, { state: "patrol", visionVisible: false }, 600);
    expect(later.value).toBe(0);
  });

  it("decays to zero once the threat is gone", () => {
    const hot: AlertMeterState = { value: 100, updatedAtMs: 0 };
    const calm = resolveAlert(hot, { state: "patrol", visionVisible: false }, 2000);
    expect(calm.value).toBe(0);
  });
});

describe("B — danger", () => {
  it("rises during pursuit at the defined rate", () => {
    const start = resolveAlert(null, { state: "pursue", visionVisible: false }, 0);
    const midway = resolveAlert(start, { state: "pursue", visionVisible: false }, 200);
    expect(midway.value).toBeCloseTo(RISE_RATE_PER_MS * 200, 6);
    const full = resolveAlert(start, { state: "pursue", visionVisible: false }, 400);
    expect(full.value).toBeCloseTo(ALERT_MAX, 6);
  });

  it("rises toward the investigate target", () => {
    const state = resolveAlert(null, { state: "investigate", visionVisible: false }, 0);
    const later = resolveAlert(state, { state: "investigate", visionVisible: false }, 280);
    expect(later.value).toBeCloseTo(70, 6);
  });

  it("rises toward the search target", () => {
    const state = resolveAlert(null, { state: "search", visionVisible: false }, 0);
    const later = resolveAlert(state, { state: "search", visionVisible: false }, 320);
    expect(later.value).toBeCloseTo(80, 6);
  });

  it("keeps rising while the player stays visible", () => {
    const state = resolveAlert(null, { state: "investigate", visionVisible: true }, 0);
    const later = resolveAlert(state, { state: "investigate", visionVisible: true }, 400);
    expect(later.value).toBeCloseTo(ALERT_MAX, 6);
  });
});

describe("C — maximum", () => {
  it("clamps at the maximum even with an arbitrarily large frame", () => {
    const state = resolveAlert(
      { value: 90, updatedAtMs: 0 },
      { state: "pursue", visionVisible: false },
      10_000_000,
    );
    expect(state.value).toBe(ALERT_MAX);
  });

  it("never exceeds the maximum during sustained pursuit", () => {
    const start = resolveAlert(null, { state: "pursue", visionVisible: false }, 0);
    const later = resolveAlert(start, { state: "pursue", visionVisible: false }, 5000);
    expect(later.value).toBe(ALERT_MAX);
  });

  it("stays clamped at the maximum once reached", () => {
    const full: AlertMeterState = { value: ALERT_MAX, updatedAtMs: 400 };
    const after = resolveAlert(full, { state: "pursue", visionVisible: false }, 900);
    expect(after.value).toBe(ALERT_MAX);
  });
});

describe("D — recovery", () => {
  it("decays from maximum to zero over the defined window", () => {
    const hot: AlertMeterState = { value: 100, updatedAtMs: 0 };
    const quarter = resolveAlert(hot, { state: "patrol", visionVisible: false }, 250);
    expect(quarter.value).toBeCloseTo(80, 6);
    const done = resolveAlert(hot, { state: "patrol", visionVisible: false }, 1250);
    expect(done.value).toBe(0);
  });

  it("settles at the return target and holds it", () => {
    const hot: AlertMeterState = { value: 100, updatedAtMs: 0 };
    const returned = resolveAlert(hot, { state: "return", visionVisible: false }, 750);
    expect(returned.value).toBeCloseTo(40, 6);
    const held = resolveAlert(at(returned), { state: "return", visionVisible: false }, 950);
    expect(held.value).toBe(40);
  });

  it("recovers from a partial alert without dropping below zero", () => {
    const partial: AlertMeterState = { value: 30, updatedAtMs: 0 };
    const calm = resolveAlert(partial, { state: "patrol", visionVisible: false }, 10_000);
    expect(calm.value).toBe(0);
  });
});

describe("E — determinism", () => {
  it("produces the same result for the same inputs and time", () => {
    const input = { state: "investigate" as const, visionVisible: true };
    const first = resolveAlert(null, input, 0);
    const second = resolveAlert(null, input, 0);
    expect(first.value).toBeCloseTo(second.value, 12);
    expect(first.updatedAtMs).toBe(second.updatedAtMs);
  });

  it("is independent of frame partitioning", () => {
    const single = resolveAlert(
      resolveAlert(null, { state: "pursue", visionVisible: false }, 0),
      { state: "pursue", visionVisible: false },
      400,
    );
    let framed = resolveAlert(null, { state: "pursue", visionVisible: false }, 0);
    for (let frame = 0; frame < 4; frame += 1) {
      framed = resolveAlert(framed, { state: "pursue", visionVisible: false }, (frame + 1) * 100);
    }
    expect(framed.value).toBeCloseTo(single.value, 6);
    expect(framed.value).toBeCloseTo(100, 6);
  });

  it("is linear for partial segments regardless of step size", () => {
    const start = resolveAlert(null, { state: "pursue", visionVisible: false }, 0);
    const oneShot = resolveAlert(start, { state: "pursue", visionVisible: false }, 100);
    let stepped = resolveAlert(null, { state: "pursue", visionVisible: false }, 0);
    for (let frame = 0; frame < 5; frame += 1) {
      stepped = resolveAlert(stepped, { state: "pursue", visionVisible: false }, (frame + 1) * 20);
    }
    expect(stepped.value).toBeCloseTo(oneShot.value, 6);
    expect(stepped.value).toBeCloseTo(RISE_RATE_PER_MS * 100, 6);
  });

  it("tolerates a clock rollback without moving or advancing the anchor", () => {
    const state = resolveAlert(null, { state: "pursue", visionVisible: false }, 500);
    const rolled = resolveAlert(state, { state: "pursue", visionVisible: false }, 100);
    expect(rolled.value).toBe(state.value);
    expect(rolled.updatedAtMs).toBe(state.updatedAtMs);
  });
});

describe("F — U6 cover compatibility", () => {
  it("keeps alert rising after the line of sight breaks while the guard investigates", () => {
    const state = resolveAlert(null, { state: "investigate", visionVisible: false }, 0);
    const later = resolveAlert(state, { state: "investigate", visionVisible: false }, 200);
    expect(later.value).toBeGreaterThanOrEqual(50);
    expect(alertBand(later.value)).toBe("alerta");
  });

  it("reaches a critical band during search after an occlusion", () => {
    const state = resolveAlert(null, { state: "search", visionVisible: false }, 0);
    const later = resolveAlert(state, { state: "search", visionVisible: false }, 320);
    expect(later.value).toBe(80);
    expect(alertBand(later.value)).toBe("critico");
  });

  it("ignores cover directly: the meter only reads state and vision", () => {
    const input = { state: "investigate", visionVisible: false } as const;
    expect(alertTarget(input)).toBe(70);
  });
});

describe("alert bands", () => {
  it("maps thresholds to calma / sospecha / alerta / critico", () => {
    expect(alertBand(0)).toBe("calma");
    expect(alertBand(24.9)).toBe("calma");
    expect(alertBand(25)).toBe("sospecha");
    expect(alertBand(49.9)).toBe("sospecha");
    expect(alertBand(50)).toBe("alerta");
    expect(alertBand(79.9)).toBe("alerta");
    expect(alertBand(80)).toBe("critico");
    expect(alertBand(100)).toBe("critico");
  });
});