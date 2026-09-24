import { describe, expect, it } from "vitest";
import { emptyPerceptionMemory } from "../../src/domain/perception/memory";
import {
  resolveTransition,
  VISION_LOST_GRACE_MS,
  type GuardTransitionContext,
} from "../../src/domain/behavior/guardState";

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

function context(overrides: Partial<GuardTransitionContext> = {}): GuardTransitionContext {
  return {
    arrivedAtGoal: false,
    goalUnreachable: false,
    timeSinceLastVisionMs: null,
    searchCovered: false,
    searchBudgetExceeded: false,
    searchUnfeasible: false,
    ...overrides,
  };
}

describe("guard state machine transitions during H4.2", () => {
  it("leaves patrol toward investigate when a sound is heard without vision", () => {
    const result = resolveTransition("patrol", perception({ sound: true }), context());

    expect(result).toEqual({ to: "investigate", cause: "sound-heard" });
  });

  it("stays in patrol without any perception input", () => {
    expect(resolveTransition("patrol", perception(), context())).toBeNull();
  });

  it("moves to search when reaching the target with no vision and no sound", () => {
    const result = resolveTransition(
      "investigate",
      perception(),
      context({ arrivedAtGoal: true }),
    );

    expect(result).toEqual({ to: "search", cause: "investigate-arrived" });
  });

  it("stays in investigate when reaching the target while a sound is still active", () => {
    expect(
      resolveTransition("investigate", perception({ sound: true }), context({ arrivedAtGoal: true })),
    ).toBeNull();
  });

  it("returns to patrol when the investigate target is unreachable", () => {
    const result = resolveTransition("investigate", perception(), context({ goalUnreachable: true }));

    expect(result).toEqual({ to: "patrol", cause: "goal-unreachable" });
  });

  it("keeps the not-yet-implemented states inert", () => {
    expect(resolveTransition("return", perception(), context())).toBeNull();
  });
});

describe("guard state machine transitions during H4.3", () => {
  it("leaves patrol toward pursue when the player becomes visible, beating sound", () => {
    const result = resolveTransition("patrol", perception({ vision: true, sound: true }), context());

    expect(result).toEqual({ to: "pursue", cause: "vision-acquired" });
  });

  it("leaves investigate toward pursue when the player becomes visible", () => {
    const result = resolveTransition("investigate", perception({ vision: true }), context());

    expect(result).toEqual({ to: "pursue", cause: "vision-acquired" });
  });

  it("stays in pursue while the player remains visible", () => {
    expect(
      resolveTransition("pursue", perception({ vision: true }), context({ timeSinceLastVisionMs: 0 })),
    ).toBeNull();
  });

  it("stays in pursue before the vision grace period elapses", () => {
    expect(
      resolveTransition(
        "pursue",
        perception(),
        context({ timeSinceLastVisionMs: VISION_LOST_GRACE_MS - 1 }),
      ),
    ).toBeNull();
  });

  it("moves to investigate after the vision grace period elapses", () => {
    const result = resolveTransition(
      "pursue",
      perception(),
      context({ timeSinceLastVisionMs: VISION_LOST_GRACE_MS }),
    );

    expect(result).toEqual({ to: "investigate", cause: "vision-lost" });
  });

  it("keeps pursuing forever when no vision has ever been seen", () => {
    expect(resolveTransition("pursue", perception(), context())).toBeNull();
  });
});

describe("guard state machine transitions during H4.4", () => {
  it("leaves search toward pursue immediately when the player becomes visible", () => {
    const result = resolveTransition("search", perception({ vision: true }), context());

    expect(result).toEqual({ to: "pursue", cause: "vision-acquired" });
  });

  it("leaves search toward patrol when the plan is covered", () => {
    const result = resolveTransition("search", perception(), context({ searchCovered: true }));

    expect(result).toEqual({ to: "patrol", cause: "search-exhausted" });
  });

  it("leaves search toward patrol when the budget is exhausted", () => {
    const result = resolveTransition(
      "search",
      perception(),
      context({ searchBudgetExceeded: true }),
    );

    expect(result).toEqual({ to: "patrol", cause: "search-exhausted" });
  });

  it("leaves search toward patrol when the plan is unfeasible", () => {
    const result = resolveTransition("search", perception(), context({ searchUnfeasible: true }));

    expect(result).toEqual({ to: "patrol", cause: "search-unfeasible" });
  });

  it("stays in search while the plan is still running", () => {
    expect(resolveTransition("search", perception(), context())).toBeNull();
  });
});