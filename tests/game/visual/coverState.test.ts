import { describe, expect, it } from "vitest";
import {
  COVER_FLASH_MS,
  confirmsSight,
  coverFlash,
  resolveCover,
} from "../../../src/game/visual/coverState";

describe("cover state derivation (A)", () => {
  it("reports covered when line of sight is broken by occlusion", () => {
    expect(resolveCover(false, "occluded")).toBe("cubierto");
  });

  it("reports exposed when the player is out of range or outside the cone", () => {
    expect(resolveCover(false, "out-of-range")).toBe("expuesto");
    expect(resolveCover(false, "outside-cone")).toBe("expuesto");
    expect(resolveCover(false, "invalid-facing")).toBe("expuesto");
  });

  it("reports visible whenever the player is actually visible", () => {
    expect(resolveCover(true, "visible")).toBe("visible");
  });

  it("prioritizes visibility over any stale reason value", () => {
    expect(resolveCover(true, "occluded")).toBe("visible");
  });
});

describe("confirmsSight invariant (B)", () => {
  it("confirms sight only for the visible reason", () => {
    expect(confirmsSight("visible")).toBe(true);
  });

  it("never confirms sight through range, cone or occlusion causes", () => {
    expect(confirmsSight("out-of-range")).toBe(false);
    expect(confirmsSight("outside-cone")).toBe(false);
    expect(confirmsSight("occluded")).toBe(false);
    expect(confirmsSight("invalid-facing")).toBe(false);
  });
});

describe("cover flash (C)", () => {
  it("starts at zero intensity on the cover onset frame", () => {
    expect(coverFlash("cubierto", 100, 100)).toBe(0);
  });

  it("peaks during the effect window", () => {
    expect(coverFlash("cubierto", 100, 100 + COVER_FLASH_MS / 2)).toBe(1);
    expect(coverFlash("cubierto", 100, 100 + 90)).toBeGreaterThan(0);
    expect(coverFlash("cubierto", 100, 100 + 90)).toBeGreaterThan(0.4);
  });

  it("returns to zero when the effect window finishes", () => {
    expect(coverFlash("cubierto", 100, 100 + COVER_FLASH_MS)).toBe(0);
    expect(coverFlash("cubierto", 100, 100 + COVER_FLASH_MS + 400)).toBe(0);
  });

  it("is zero before the effect window starts", () => {
    expect(coverFlash("cubierto", 100, 50)).toBe(0);
  });

  it("is zero unless the guard is actually covered", () => {
    expect(coverFlash("visible", 100, 200)).toBe(0);
    expect(coverFlash("expuesto", 100, 200)).toBe(0);
  });

  it("uses a symmetric rise/fall bounded between zero and one", () => {
    expect(coverFlash("cubierto", 100, 100 + 90)).toBeCloseTo(0.5143, 3);
    expect(coverFlash("cubierto", 100, 100 + 280)).toBeLessThan(
      coverFlash("cubierto", 100, 100 + 90),
    );
    expect(coverFlash("cubierto", 100, 100 + 280)).toBeGreaterThan(0);
  });

  it("rejects non-positive durations", () => {
    expect(() => coverFlash("cubierto", 0, 0, 0)).toThrow();
    expect(() => coverFlash("cubierto", 0, 0, -10)).toThrow();
  });
});

describe("cover re-emergence (D)", () => {
  it("returns to visible without persisting the covered state", () => {
    expect(resolveCover(false, "occluded")).toBe("cubierto");
    expect(resolveCover(true, "visible")).toBe("visible");
  });

  it("clears the flash once the same re-acquired frame is not covered", () => {
    expect(coverFlash("cubierto", 0, 175)).toBe(1);
    expect(coverFlash("visible", 0, 175)).toBe(0);
  });
});