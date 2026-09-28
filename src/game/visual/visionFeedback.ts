import type { Vector2 } from "../../domain/model/vector";

export type VisionFeedbackState = "normal" | "detection" | "grace";

export interface VisionFeedbackInput {
  readonly visible: boolean;
  readonly lastVisionAgeMs: number | null;
  readonly graceMs: number;
}

export function resolveVisionFeedback(input: VisionFeedbackInput): VisionFeedbackState {
  if (input.visible) {
    return "detection";
  }
  if (input.lastVisionAgeMs !== null && input.lastVisionAgeMs < input.graceMs) {
    return "grace";
  }
  return "normal";
}

export interface VisionSector {
  readonly angle: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export function visionSector(facing: Vector2, fieldOfViewRadians: number): VisionSector {
  const angle = Math.atan2(facing.y, facing.x);
  const halfFieldOfView = fieldOfViewRadians / 2;
  return {
    angle,
    startAngle: angle - halfFieldOfView,
    endAngle: angle + halfFieldOfView,
  };
}