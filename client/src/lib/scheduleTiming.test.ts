import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  utcToLocalWeekly,
  localToUtcWeekly,
  utcHourToLocalHour,
  localHourToUtcHour,
} from "./scheduleTiming";

describe("scheduleTiming (America/New_York, EST = UTC-5, no DST)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers();
    // 2026-01-12 is a Monday. January is outside US DST (EST = UTC-5).
    vi.setSystemTime(new Date("2026-01-12T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("utcToLocalWeekly converts Tuesday 02:00 UTC to Monday 21:00 local", () => {
    expect(utcToLocalWeekly(2, 2)).toEqual({ dayOfWeek: 1, hour: 21 });
  });

  it("localToUtcWeekly converts Monday 21:00 local back to Tuesday 02:00 UTC", () => {
    expect(localToUtcWeekly(1, 21)).toEqual({ dayOfWeek: 2, hourUtc: 2 });
  });

  it("utcToLocalWeekly wraps to the previous day when the local offset crosses midnight", () => {
    // Sunday 00:00 UTC -> Saturday 19:00 local (EST).
    expect(utcToLocalWeekly(0, 0)).toEqual({ dayOfWeek: 6, hour: 19 });
  });

  it("localToUtcWeekly wraps to the next day when the UTC offset crosses midnight", () => {
    // Saturday 19:00 local (EST) -> Sunday 00:00 UTC.
    expect(localToUtcWeekly(6, 19)).toEqual({ dayOfWeek: 0, hourUtc: 0 });
  });

  it("utcHourToLocalHour converts 14:00 UTC to 09:00 local", () => {
    expect(utcHourToLocalHour(14)).toBe(9);
  });

  it("localHourToUtcHour converts 09:00 local to 14:00 UTC", () => {
    expect(localHourToUtcHour(9)).toBe(14);
  });
});
