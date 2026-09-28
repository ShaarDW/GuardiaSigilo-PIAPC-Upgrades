import type { GuardState } from "../../domain/behavior/guardState";

export type AlertBand = "calma" | "sospecha" | "alerta" | "critico";

export interface AlertMeterState {
  readonly value: number;
  readonly updatedAtMs: number;
}

export interface AlertInput {
  readonly state: GuardState;
  readonly visionVisible: boolean;
}

export const ALERT_MAX = 100;
export const RISE_RATE_PER_MS = 0.25;
export const FALL_RATE_PER_MS = 0.08;

export function alertTarget(input: AlertInput): number {
  if (input.visionVisible) {
    return ALERT_MAX;
  }
  switch (input.state) {
    case "patrol":
      return 0;
    case "return":
      return 40;
    case "investigate":
      return 70;
    case "search":
      return 80;
    case "pursue":
      return ALERT_MAX;
  }
}

export function resolveAlert(
  previous: AlertMeterState | null,
  input: AlertInput,
  timeMs: number,
): AlertMeterState {
  const value0 = previous === null ? 0 : previous.value;
  const startedAtMs = previous === null ? timeMs : previous.updatedAtMs;
  const dt = Math.max(0, timeMs - startedAtMs);
  const target = alertTarget(input);
  const gap = target - value0;
  let value = value0;
  if (gap > 0) {
    value += Math.min(gap, RISE_RATE_PER_MS * dt);
  } else {
    value -= Math.min(-gap, FALL_RATE_PER_MS * dt);
  }
  const clamped = Math.min(ALERT_MAX, Math.max(0, value));
  return { value: clamped, updatedAtMs: Math.max(startedAtMs, timeMs) };
}

export function alertBand(value: number): AlertBand {
  if (value < 25) {
    return "calma";
  }
  if (value < 50) {
    return "sospecha";
  }
  if (value < 80) {
    return "alerta";
  }
  return "critico";
}