import { describe, expect, it } from "vitest";
import { emptyPerceptionMemory } from "../../src/domain/perception/memory";
import { resolveTransition } from "../../src/domain/behavior/guardState";

function perception(overrides: { vision?: boolean; sound?: boolean } = {}): {
  visionVisible: boolean;
  soundHeard: boolean;
  memory: ReturnType<typeof emptyPerceptionMemory>;
} {
  return {
    visionVisible: overrides.vision ?? false,
    soundHeard: overrides.sound ?? false,
    memory: emptyPerceptionMemory(),
  };
}

describe("guard state machine transitions during H4.2", () => {
  it("leaves patrol toward investigate when a sound is heard without vision", () => {
    const result = resolveTransition("patrol", perception({ sound: true }), false, false);

    expect(result).toEqual({ to: "investigate", cause: "sound-heard" });
  });

  it("does not leave patrol when a sound is heard while the player is visible", () => {
    expect(
      resolveTransition("patrol", perception({ vision: true, sound: true }), false, false),
    ).toBeNull();
  });

  it("stays in patrol without any perception input", () => {
    expect(resolveTransition("patrol", perception(), false, false)).toBeNull();
  });

  it("returns to patrol when reaching the target with no vision and no sound", () => {
    const result = resolveTransition("investigate", perception(), true, false);

    expect(result).toEqual({ to: "patrol", cause: "investigate-arrived" });
  });

  it("stays in investigate when reaching the target while the player is still visible", () => {
    expect(resolveTransition("investigate", perception({ vision: true }), true, false)).toBeNull();
  });

  it("stays in investigate when reaching the target while a sound is still active", () => {
    expect(resolveTransition("investigate", perception({ sound: true }), true, false)).toBeNull();
  });

  it("returns to patrol when the investigate target is unreachable", () => {
    const result = resolveTransition("investigate", perception(), false, true);

    expect(result).toEqual({ to: "patrol", cause: "goal-unreachable" });
  });

  it("keeps the not-yet-implemented states inert", () => {
    const perceptionInput = perception();

    expect(resolveTransition("pursue", perceptionInput, false, false)).toBeNull();
    expect(resolveTransition("search", perceptionInput, false, false)).toBeNull();
    expect(resolveTransition("return", perceptionInput, false, false)).toBeNull();
  });
});