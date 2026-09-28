import type { GuardState } from "../../domain/behavior/guardState";
import type { Vector2 } from "../../domain/model/vector";

export type GuardVisualKind = "calm" | "attentive" | "urgent" | "scanning" | "returning";

export interface GuardVisualPresentation {
  readonly kind: GuardVisualKind;
  readonly accent: number;
  readonly ringWidth: number;
  readonly pulsePeriodMs: number;
  readonly scanRadius: boolean;
  readonly streakGain: number;
}

export const GUARD_TRANSITION_EFFECT_MS = 350;
export const GUARD_SEARCH_SCAN_PERIOD_MS = 700;

const PRESENTATIONS: Readonly<Record<GuardState, GuardVisualPresentation>> = {
  patrol: {
    kind: "calm",
    accent: 0x9eb4c2,
    ringWidth: 1.5,
    pulsePeriodMs: 1200,
    scanRadius: false,
    streakGain: 0.5,
  },
  investigate: {
    kind: "attentive",
    accent: 0x62d0e8,
    ringWidth: 2,
    pulsePeriodMs: 800,
    scanRadius: false,
    streakGain: 1,
  },
  pursue: {
    kind: "urgent",
    accent: 0xe16969,
    ringWidth: 2.5,
    pulsePeriodMs: 400,
    scanRadius: false,
    streakGain: 2,
  },
  search: {
    kind: "scanning",
    accent: 0x73c991,
    ringWidth: 2,
    pulsePeriodMs: 700,
    scanRadius: true,
    streakGain: 1,
  },
  return: {
    kind: "returning",
    accent: 0xe5a439,
    ringWidth: 1.5,
    pulsePeriodMs: 1100,
    scanRadius: false,
    streakGain: 1,
  },
};

export function guardStatePresentation(state: GuardState): GuardVisualPresentation {
  return PRESENTATIONS[state];
}

export type GuardEffectName = "investigate" | "acquire" | "lost" | "search" | "exhaust" | "returned";

export interface GuardTransitionEffect {
  readonly name: GuardEffectName;
  readonly durationMs: number;
}

export interface GuardEffectState {
  readonly effect: GuardTransitionEffect | null;
  readonly startedAtMs: number | null;
}

export function emptyGuardEffectState(): GuardEffectState {
  return { effect: null, startedAtMs: null };
}

export function transitionEffectOf(from: GuardState, to: GuardState): GuardTransitionEffect | null {
  if (from === to) {
    return null;
  }
  if (to === "pursue") {
    return { name: "acquire", durationMs: GUARD_TRANSITION_EFFECT_MS };
  }
  const pairs: ReadonlyArray<readonly [GuardState, GuardState, GuardEffectName]> = [
    ["patrol", "investigate", "investigate"],
    ["pursue", "investigate", "lost"],
    ["investigate", "search", "search"],
    ["search", "return", "exhaust"],
    ["return", "patrol", "returned"],
    ["investigate", "patrol", "returned"],
  ];
  const match = pairs.find(([fromState, toState]) => from === fromState && to === toState);
  return match
    ? { name: match[2], durationMs: GUARD_TRANSITION_EFFECT_MS }
    : null;
}

export function updateGuardEffect(
  current: GuardEffectState,
  transitions: ReadonlyArray<{ readonly from: GuardState; readonly to: GuardState }>,
  timeMs: number,
): GuardEffectState {
  const lastChange = [...transitions].reverse().find((event) => event.from !== event.to);
  if (lastChange) {
    const effect = transitionEffectOf(lastChange.from, lastChange.to);
    return effect
      ? { effect, startedAtMs: timeMs }
      : { effect: null, startedAtMs: null };
  }
  if (
    current.effect
    && current.startedAtMs !== null
    && timeMs - current.startedAtMs >= current.effect.durationMs
  ) {
    return { effect: null, startedAtMs: null };
  }
  return current;
}

export function effectProgress(timeMs: number, startedAtMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    throw new Error("Effect duration must be positive.");
  }
  return Math.min(1, Math.max(0, (timeMs - startedAtMs) / durationMs));
}

export function pulsePhase(timeMs: number, periodMs: number): number {
  if (periodMs <= 0) {
    throw new Error("Pulse period must be positive.");
  }
  return (timeMs % periodMs) / periodMs;
}

export interface GuardMotionVisual {
  readonly streak: boolean;
  readonly streakGain: number;
}

export function motionVisual(moving: boolean, state: GuardState): GuardMotionVisual {
  const gain = PRESENTATIONS[state].streakGain;
  return { streak: moving && gain > 0, streakGain: moving ? gain : 0 };
}

export function guardFacingAngle(facing: Vector2): number {
  return Math.atan2(facing.y, facing.x);
}