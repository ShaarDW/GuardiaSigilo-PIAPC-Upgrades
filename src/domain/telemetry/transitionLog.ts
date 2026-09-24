import type { GridPoint } from "../model/grid";
import type { GuardCause, GuardState } from "../behavior/guardState";

export interface TransitionEvent {
  readonly timeMs: number;
  readonly from: GuardState;
  readonly to: GuardState;
  readonly cause: GuardCause;
  readonly target: GridPoint | null;
}

export interface TransitionLog {
  readonly events: readonly TransitionEvent[];
  readonly tailLimit: number;
}

export function createTransitionLog(tailLimit = 10): TransitionLog {
  if (!Number.isInteger(tailLimit) || tailLimit <= 0) {
    throw new Error("Transition log tail limit must be a positive integer.");
  }
  return { events: [], tailLimit };
}

export function appendTransition(
  log: TransitionLog,
  event: TransitionEvent,
): TransitionLog {
  const events = [...log.events, event];
  const trimmed = events.length > log.tailLimit
    ? events.slice(events.length - log.tailLimit)
    : events;
  return { events: trimmed, tailLimit: log.tailLimit };
}