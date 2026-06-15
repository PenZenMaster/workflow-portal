import { describe, it, expect } from "vitest";
import { computeNextFireAt, SCHEDULE_TICK_INTERVAL_MS } from "../../../server/services/scheduling";

describe("computeNextFireAt", () => {
  it("weekly: returns the next occurrence of dayOfWeek at hourUtc when it is later this week", () => {
    // Monday 2026-06-15 10:00 UTC, schedule = Tuesday 14:00 UTC
    const from = new Date("2026-06-15T10:00:00.000Z");
    const result = computeNextFireAt({ cadence: "weekly", hourUtc: 14, dayOfWeek: 2 }, from);
    expect(new Date(result).toISOString()).toBe("2026-06-16T14:00:00.000Z");
  });

  it("weekly: rolls over to next week when the target time today/this week has already passed", () => {
    // Tuesday 2026-06-16 16:00 UTC, schedule = Tuesday 14:00 UTC (already passed today)
    const from = new Date("2026-06-16T16:00:00.000Z");
    const result = computeNextFireAt({ cadence: "weekly", hourUtc: 14, dayOfWeek: 2 }, from);
    expect(new Date(result).toISOString()).toBe("2026-06-23T14:00:00.000Z");
  });

  it("weekly: defaults dayOfWeek to the current day when not provided", () => {
    // Monday 2026-06-15 10:00 UTC, no dayOfWeek, hourUtc=14 -> next Monday 14:00
    const from = new Date("2026-06-15T10:00:00.000Z");
    const result = computeNextFireAt({ cadence: "weekly", hourUtc: 14 }, from);
    expect(new Date(result).toISOString()).toBe("2026-06-15T14:00:00.000Z");
  });

  it("monthly: returns the next occurrence of dayOfMonth at hourUtc when it is later this month", () => {
    // 2026-06-05 10:00 UTC, schedule = 10th at 14:00 UTC
    const from = new Date("2026-06-05T10:00:00.000Z");
    const result = computeNextFireAt({ cadence: "monthly", hourUtc: 14, dayOfMonth: 10 }, from);
    expect(new Date(result).toISOString()).toBe("2026-06-10T14:00:00.000Z");
  });

  it("monthly: rolls over to next month when the target day/time has already passed this month", () => {
    // 2026-06-15 10:00 UTC, schedule = 10th at 14:00 UTC (already passed)
    const from = new Date("2026-06-15T10:00:00.000Z");
    const result = computeNextFireAt({ cadence: "monthly", hourUtc: 14, dayOfMonth: 10 }, from);
    expect(new Date(result).toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });

  it("monthly: rolls over to next month when exactly at the fire time (strictly after 'from')", () => {
    const from = new Date("2026-06-10T14:00:00.000Z");
    const result = computeNextFireAt({ cadence: "monthly", hourUtc: 14, dayOfMonth: 10 }, from);
    expect(new Date(result).toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });

  it("exposes a one-hour recurring tick interval", () => {
    expect(SCHEDULE_TICK_INTERVAL_MS).toBe(60 * 60 * 1000);
  });
});
