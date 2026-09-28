import { describe, expect, it } from "vitest";
import {
  resolveVisionFeedback,
  visionSector,
} from "../../../src/game/visual/visionFeedback";

describe("resolveVisionFeedback", () => {
  it("reports detection when the target is visible", () => {
    expect(resolveVisionFeedback({ visible: true, lastVisionAgeMs: 0, graceMs: 200 })).toBe(
      "detection",
    );
  });

  it("remains detection on sustained visibility regardless of elapsed time", () => {
    expect(resolveVisionFeedback({ visible: true, lastVisionAgeMs: 5000, graceMs: 200 })).toBe(
      "detection",
    );
  });

  it("is normal with no prior sighting", () => {
    expect(resolveVisionFeedback({ visible: false, lastVisionAgeMs: null, graceMs: 200 })).toBe(
      "normal",
    );
  });

  it("keeps grace for the whole loss window", () => {
    expect(resolveVisionFeedback({ visible: false, lastVisionAgeMs: 0, graceMs: 200 })).toBe(
      "grace",
    );
    expect(resolveVisionFeedback({ visible: false, lastVisionAgeMs: 199, graceMs: 200 })).toBe(
      "grace",
    );
  });

  it("exits grace exactly at the boundary like the state machine", () => {
    expect(resolveVisionFeedback({ visible: false, lastVisionAgeMs: 200, graceMs: 200 })).toBe(
      "normal",
    );
    expect(resolveVisionFeedback({ visible: false, lastVisionAgeMs: 500, graceMs: 200 })).toBe(
      "normal",
    );
  });
});

describe("visionSector", () => {
  it("centers the cone on the guard facing direction", () => {
    expect(visionSector({ x: 1, y: 0 }, Math.PI / 2)).toEqual({
      angle: 0,
      startAngle: -Math.PI / 4,
      endAngle: Math.PI / 4,
    });
  });

  it("follows any rotation of the guard", () => {
    const quarter = Math.PI / 4;
    const sector = visionSector({ x: Math.cos(quarter), y: Math.sin(quarter) }, Math.PI / 2);
    expect(sector.angle).toBeCloseTo(quarter);
    expect(sector.startAngle).toBeCloseTo(0);
    expect(sector.endAngle).toBeCloseTo(Math.PI / 2);
  });

  it("maps cardinal facings consistently", () => {
    expect(visionSector({ x: 0, y: 1 }, Math.PI / 2).angle).toBeCloseTo(Math.PI / 2);
    expect(visionSector({ x: -1, y: 0 }, Math.PI / 2).angle).toBeCloseTo(Math.PI);
    expect(visionSector({ x: 0, y: -1 }, Math.PI / 2).angle).toBeCloseTo(-Math.PI / 2);
  });

  it("uses the field of view passed as parameter", () => {
    const sector = visionSector({ x: 1, y: 0 }, Math.PI / 4);
    expect(sector.startAngle).toBeCloseTo(-Math.PI / 8);
    expect(sector.endAngle).toBeCloseTo(Math.PI / 8);
  });
});