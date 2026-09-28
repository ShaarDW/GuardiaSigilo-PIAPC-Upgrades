import { describe, expect, it } from "vitest";
import type { GuardState } from "../../../src/domain/behavior/guardState";
import {
  emptyGuardEffectState,
  effectProgress,
  guardFacingAngle,
  guardStatePresentation,
  GUARD_TRANSITION_EFFECT_MS,
  motionVisual,
  pulsePhase,
  transitionEffectOf,
  updateGuardEffect,
  type GuardEffectName,
} from "../../../src/game/visual/guardPresentation";

const ALL_STATES: readonly GuardState[] = ["patrol", "investigate", "pursue", "search", "return"];

describe("guard state representation (A)", () => {
  it("assigns a distinct presentation to every FSM state", () => {
    const kinds = ALL_STATES.map((state) => guardStatePresentation(state).kind);
    expect(kinds).toEqual(["calm", "attentive", "urgent", "scanning", "returning"]);
    expect(new Set(kinds).size).toBe(ALL_STATES.length);
  });

  it("uses a distinct accent color per state", () => {
    const accents = ALL_STATES.map((state) => guardStatePresentation(state).accent);
    expect(new Set(accents).size).toBe(ALL_STATES.length);
  });

  it("marks only search with the scan ring and pursue with the highest urgency", () => {
    expect(ALL_STATES.map((state) => guardStatePresentation(state).scanRadius)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(guardStatePresentation("pursue").streakGain)
      .toBeGreaterThan(guardStatePresentation("patrol").streakGain);
  });

  it("gives every state a positive bounded pulse period", () => {
    for (const state of ALL_STATES) {
      expect(guardStatePresentation(state).pulsePeriodMs).toBeGreaterThan(0);
    }
  });
});

describe("transition feedback (B)", () => {
  const required: ReadonlyArray<readonly [GuardState, GuardState, GuardEffectName]> = [
    ["patrol", "investigate", "investigate"],
    ["patrol", "pursue", "acquire"],
    ["investigate", "pursue", "acquire"],
    ["pursue", "investigate", "lost"],
    ["investigate", "search", "search"],
    ["search", "return", "exhaust"],
    ["return", "patrol", "returned"],
  ];

  it.each(required)("maps the real transition %s -> %s to the %s effect", (from, to, name) => {
    expect(transitionEffectOf(from, to)?.name).toBe(name);
  });

  it("uses the same acquire effect for vision during search and return", () => {
    expect(transitionEffectOf("search", "pursue")?.name).toBe("acquire");
    expect(transitionEffectOf("return", "pursue")?.name).toBe("acquire");
    expect(transitionEffectOf("investigate", "patrol")?.name).toBe("returned");
  });

  it("ignores same-state chatter without duplicating transition rules", () => {
    expect(transitionEffectOf("patrol", "patrol")).toBeNull();
    expect(transitionEffectOf("return", "return")).toBeNull();
  });

  it("bounds every transition effect to a short fixed window", () => {
    for (const state of ALL_STATES) {
      for (const target of ALL_STATES) {
        const effect = transitionEffectOf(state, target);
        if (effect) {
          expect(effect.durationMs).toBe(GUARD_TRANSITION_EFFECT_MS);
          expect(effect.durationMs).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("current state priority and bounded duration (C)", () => {
  it("starts an effect when a real transition arrives", () => {
    const result = updateGuardEffect(
      emptyGuardEffectState(),
      [{ from: "patrol", to: "investigate" }],
      1000,
    );
    expect(result.effect?.name).toBe("investigate");
    expect(result.startedAtMs).toBe(1000);
  });

  it("replaces an active effect when a newer transition wins", () => {
    const active = updateGuardEffect(
      emptyGuardEffectState(),
      [{ from: "patrol", to: "pursue" }],
      100,
    );
    const replaced = updateGuardEffect(active, [{ from: "pursue", to: "investigate" }], 250);
    expect(replaced.effect?.name).toBe("lost");
    expect(replaced.startedAtMs).toBe(250);
  });

  it("lets the latest real change of a frame win without accumulating a queue", () => {
    const result = updateGuardEffect(
      emptyGuardEffectState(),
      [
        { from: "patrol", to: "investigate" },
        { from: "investigate", to: "pursue" },
      ],
      100,
    );
    expect(result.effect?.name).toBe("acquire");
  });

  it("keeps the effect within its bounded window and expires it on time", () => {
    const active = updateGuardEffect(
      emptyGuardEffectState(),
      [{ from: "search", to: "return" }],
      100,
    );
    const stillActive = updateGuardEffect(active, [], 100 + GUARD_TRANSITION_EFFECT_MS - 1);
    expect(stillActive.effect?.name).toBe("exhaust");

    const expired = updateGuardEffect(active, [], 100 + GUARD_TRANSITION_EFFECT_MS);
    expect(expired.effect).toBeNull();
    expect(expired.startedAtMs).toBeNull();
  });

  it("ignores same-state chatter within a frame and keeps an idle session clean", () => {
    expect(
      updateGuardEffect(emptyGuardEffectState(), [{ from: "patrol", to: "patrol" }], 100).effect,
    ).toBeNull();
    expect(updateGuardEffect(emptyGuardEffectState(), [], 5000).effect).toBeNull();
  });
});

describe("bounded time helpers (D)", () => {
  it("clamps effect progress to [0, 1] using elapsed time", () => {
    expect(effectProgress(100, 100, GUARD_TRANSITION_EFFECT_MS)).toBe(0);
    expect(effectProgress(100 + GUARD_TRANSITION_EFFECT_MS, 100, GUARD_TRANSITION_EFFECT_MS)).toBe(1);
    expect(effectProgress(100 + 500, 100, GUARD_TRANSITION_EFFECT_MS)).toBe(1);
    expect(effectProgress(50, 100, GUARD_TRANSITION_EFFECT_MS)).toBe(0);
  });

  it("advances pulses deterministically with elapsed time and wraps within one period", () => {
    const period = 400;
    expect(pulsePhase(100, period)).toBeCloseTo(0.25);
    expect(pulsePhase(300, period)).toBeCloseTo(0.75);
    expect(pulsePhase(400, period)).toBeCloseTo(0);
    expect(pulsePhase(1000, period)).toBeCloseTo(0.5);
  });
});

describe("movement and orientation compatibility with U1 (E)", () => {
  it("never presents movement visuals while the guard is stopped (patrol pause)", () => {
    for (const state of ALL_STATES) {
      const stopped = motionVisual(false, state);
      expect(stopped.streak).toBe(false);
      expect(stopped.streakGain).toBe(0);
    }
  });

  it("shows a stronger streak in pursue only while moving", () => {
    expect(motionVisual(true, "pursue").streak).toBe(true);
    expect(motionVisual(true, "pursue").streakGain)
      .toBeGreaterThan(motionVisual(true, "patrol").streakGain);
    expect(motionVisual(true, "search").streak).toBe(true);
  });

  it("maps the guard facing to an angle for the visor and the sweep", () => {
    expect(guardFacingAngle({ x: 1, y: 0 })).toBeCloseTo(0);
    expect(guardFacingAngle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(guardFacingAngle({ x: -1, y: 0 })).toBeCloseTo(Math.PI);
    expect(guardFacingAngle({ x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2);
  });
});