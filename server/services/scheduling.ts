/*
 * Module/Script Name: scheduling.ts
 * Path: server/services/scheduling.ts
 *
 * Description:
 * Computes the next UTC fire time for a recurring prompt run schedule
 * (weekly on a given day-of-week, or monthly on a given day-of-month), and
 * defines the recurring interval at which the schedule-tick job re-enqueues
 * itself. Used both when a schedule is created/updated and by the
 * schedule-tick job handler after it fires.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-15
 * Last Modified Date: 2026-06-15
 * Comments:
 * - v1.00 Initial implementation (B-18)
 */

export const SCHEDULE_TICK_INTERVAL_MS = 60 * 60 * 1000;

export interface ScheduleTiming {
  cadence: "weekly" | "monthly";
  hourUtc: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
}

export function computeNextFireAt(timing: ScheduleTiming, from: Date = new Date()): number {
  const next = new Date(from);
  next.setUTCHours(timing.hourUtc, 0, 0, 0);

  if (timing.cadence === "weekly") {
    const targetDay = timing.dayOfWeek ?? from.getUTCDay();
    const diff = (targetDay - next.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + diff);
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 7);
    }
  } else {
    const targetDate = timing.dayOfMonth ?? from.getUTCDate();
    next.setUTCDate(targetDate);
    if (next.getTime() <= from.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(targetDate);
    }
  }

  return next.getTime();
}
