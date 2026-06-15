/*
 * Module/Script Name: scheduleTiming.ts
 * Path: client/src/lib/scheduleTiming.ts
 *
 * Description:
 * Converts recurring run-schedule timing fields (day-of-week + hour, stored
 * and sent to the API in UTC) to and from the browser's local timezone for
 * display and form input on PromptCollectionDetail.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-15
 * Last Modified Date: 2026-06-15
 * Comments:
 * - v1.00 Initial implementation (B-19 follow-up: UTC -> local display)
 */

export function utcToLocalWeekly(dayOfWeekUtc: number, hourUtc: number): { dayOfWeek: number; hour: number } {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + (dayOfWeekUtc - d.getUTCDay()));
  return { dayOfWeek: d.getDay(), hour: d.getHours() };
}

export function localToUtcWeekly(dayOfWeekLocal: number, hourLocal: number): { dayOfWeek: number; hourUtc: number } {
  const d = new Date();
  d.setHours(hourLocal, 0, 0, 0);
  d.setDate(d.getDate() + (dayOfWeekLocal - d.getDay()));
  return { dayOfWeek: d.getUTCDay(), hourUtc: d.getUTCHours() };
}

export function utcHourToLocalHour(hourUtc: number): number {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.getHours();
}

export function localHourToUtcHour(hourLocal: number): number {
  const d = new Date();
  d.setHours(hourLocal, 0, 0, 0);
  return d.getUTCHours();
}
