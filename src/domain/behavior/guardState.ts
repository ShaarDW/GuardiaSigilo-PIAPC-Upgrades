import type { PerceptionMemory } from "../perception/memory";

export type GuardState = "patrol" | "investigate" | "pursue" | "search" | "return";

export type GuardCause =
  | "patrol-started"
  | "arrived"
  | "patrol-point-selected"
  | "patrol-point-skipped"
  | "route-replanned"
  | "sound-heard"
  | "investigate-target"
  | "investigate-arrived"
  | "retargeted"
  | "goal-unreachable"
  | "vision-acquired"
  | "vision-lost"
  | "search-started"
  | "search-waypoint"
  | "search-exhausted"
  | "search-unfeasible"
  | "return-started"
  | "returned-to-patrol"
  | "alternate-patrol-point";

export const VISION_LOST_GRACE_MS = 200;

export interface GuardPerceptionInput {
  readonly visionVisible: boolean;
  readonly soundHeard: boolean;
  readonly memory: PerceptionMemory;
}

export interface GuardTransitionContext {
  readonly arrivedAtGoal: boolean;
  readonly goalUnreachable: boolean;
  readonly timeSinceLastVisionMs: number | null;
}

export interface GuardTransitionResolution {
  readonly to: GuardState;
  readonly cause: GuardCause;
}

export function resolveTransition(
  state: GuardState,
  perception: GuardPerceptionInput,
  context: GuardTransitionContext,
): GuardTransitionResolution | null {
  if (state === "patrol") {
    if (perception.visionVisible) {
      return { to: "pursue", cause: "vision-acquired" };
    }
    if (perception.soundHeard) {
      return { to: "investigate", cause: "sound-heard" };
    }
    return null;
  }
  if (state === "investigate") {
    if (perception.visionVisible) {
      return { to: "pursue", cause: "vision-acquired" };
    }
    if (context.goalUnreachable) {
      return { to: "patrol", cause: "goal-unreachable" };
    }
    if (context.arrivedAtGoal && !perception.soundHeard) {
      return { to: "patrol", cause: "investigate-arrived" };
    }
    return null;
  }
  if (state === "pursue") {
    if (
      !perception.visionVisible
      && context.timeSinceLastVisionMs !== null
      && context.timeSinceLastVisionMs >= VISION_LOST_GRACE_MS
    ) {
      return { to: "investigate", cause: "vision-lost" };
    }
    return null;
  }
  return null;
}