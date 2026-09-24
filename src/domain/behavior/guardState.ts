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

export interface GuardPerceptionInput {
  readonly visionVisible: boolean;
  readonly soundHeard: boolean;
  readonly memory: PerceptionMemory;
}

export interface GuardTransitionResolution {
  readonly to: GuardState;
  readonly cause: GuardCause;
}

export function resolveTransition(
  state: GuardState,
  perception: GuardPerceptionInput,
  arrivedAtGoal: boolean,
  goalUnreachable: boolean,
): GuardTransitionResolution | null {
  if (state === "patrol") {
    if (perception.soundHeard && !perception.visionVisible) {
      return { to: "investigate", cause: "sound-heard" };
    }
    return null;
  }
  if (state === "investigate") {
    if (goalUnreachable) {
      return { to: "patrol", cause: "goal-unreachable" };
    }
    if (arrivedAtGoal && !perception.visionVisible && !perception.soundHeard) {
      return { to: "patrol", cause: "investigate-arrived" };
    }
    return null;
  }
  return null;
}