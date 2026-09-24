import { describe, expect, it } from "vitest";
import {
  appendTransition,
  createTransitionLog,
  type TransitionEvent,
} from "../../../src/domain/telemetry/transitionLog";

const EVENT: TransitionEvent = {
  timeMs: 100,
  from: "patrol",
  to: "patrol",
  cause: "arrived",
  target: { x: 2, y: 17 },
};

describe("transition log", () => {
  it("starts empty with a configured tail limit", () => {
    const log = createTransitionLog(3);

    expect(log.events).toEqual([]);
    expect(log.tailLimit).toBe(3);
  });

  it("appends events preserving order", () => {
    let log = createTransitionLog(3);
    log = appendTransition(log, EVENT);
    log = appendTransition(log, { ...EVENT, timeMs: 200 });

    expect(log.events.map((event) => event.timeMs)).toEqual([100, 200]);
  });

  it("keeps only the newest events beyond the tail limit", () => {
    let log = createTransitionLog(2);
    log = appendTransition(log, { ...EVENT, timeMs: 100 });
    log = appendTransition(log, { ...EVENT, timeMs: 200 });
    log = appendTransition(log, { ...EVENT, timeMs: 300 });

    expect(log.events.map((event) => event.timeMs)).toEqual([200, 300]);
  });

  it("rejects invalid tail limits", () => {
    expect(() => createTransitionLog(0)).toThrow("tail limit");
    expect(() => createTransitionLog(Number.NaN)).toThrow("tail limit");
  });
});