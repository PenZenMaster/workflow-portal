/*
 * Module/Script Name: reparseStatus.ts
 * Path: client/src/pages/ai/reparseStatus.ts
 *
 * Description:
 * Pure helpers for interpreting /api/runs/:id/reparse-status responses,
 * used by RunDetail to show re-parse progress and completion feedback.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-12
 * Last Modified Date: 2026-06-12
 * Comments:
 * - v1.00 initial implementation
 */

export interface ReparseStatus {
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
}

export function isReparseComplete(status: ReparseStatus): boolean {
  return status.total > 0 && status.done + status.failed + status.cancelled >= status.total;
}

export function reparseProgressLabel(status: ReparseStatus): string {
  const finished = status.done + status.failed + status.cancelled;
  return `Re-parsing responses: ${finished}/${status.total} done`;
}
