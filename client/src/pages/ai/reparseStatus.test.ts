import { describe, it, expect } from "vitest";
import { isReparseComplete, reparseProgressLabel, type ReparseStatus } from "./reparseStatus";

function status(overrides: Partial<ReparseStatus>): ReparseStatus {
  return { total: 0, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0, ...overrides };
}

describe("isReparseComplete", () => {
  it("is false while jobs are still queued or running", () => {
    expect(isReparseComplete(status({ total: 3, queued: 2, done: 1 }))).toBe(false);
    expect(isReparseComplete(status({ total: 3, running: 1, done: 2 }))).toBe(false);
  });

  it("is false when no jobs have been observed yet", () => {
    expect(isReparseComplete(status({ total: 0 }))).toBe(false);
  });

  it("is true once every job has reached a terminal state", () => {
    expect(isReparseComplete(status({ total: 3, done: 3 }))).toBe(true);
    expect(isReparseComplete(status({ total: 3, done: 1, failed: 1, cancelled: 1 }))).toBe(true);
  });
});

describe("reparseProgressLabel", () => {
  it("reports how many of the total jobs have finished", () => {
    expect(reparseProgressLabel(status({ total: 10, done: 4 }))).toBe(
      "Re-parsing responses: 4/10 done"
    );
    expect(reparseProgressLabel(status({ total: 2, done: 1, failed: 1 }))).toBe(
      "Re-parsing responses: 2/2 done"
    );
  });
});
