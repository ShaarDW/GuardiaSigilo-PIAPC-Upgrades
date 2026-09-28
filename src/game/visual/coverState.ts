import type { VisionReason } from "../../domain/perception/perception";

export type CoverState = "visible" | "cubierto" | "expuesto";

export const COVER_FLASH_MS = 350;

export function confirmsSight(reason: VisionReason): boolean {
  return reason === "visible";
}

export function resolveCover(visible: boolean, reason: VisionReason): CoverState {
  if (visible) {
    return "visible";
  }
  if (reason === "occluded") {
    return "cubierto";
  }
  return "expuesto";
}

export function coverFlash(
  state: CoverState,
  sinceMs: number,
  elapsedMs: number,
  durationMs: number = COVER_FLASH_MS,
): number {
  if (durationMs <= 0) {
    throw new Error("Cover flash duration must be positive.");
  }
  if (state !== "cubierto") {
    return 0;
  }
  const progress = Math.min(1, Math.max(0, (elapsedMs - sinceMs) / durationMs));
  if (progress <= 0 || progress >= 1) {
    return 0;
  }
  return progress <= 0.5 ? 2 * progress : 2 * (1 - progress);
}