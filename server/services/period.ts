/*
 * Module/Script Name: period.ts
 * Path: server/services/period.ts
 *
 * Description:
 * Converts a metrics period label (30d, 90d, 365d) into an inclusive
 * fromDate/toDate pair (YYYY-MM-DD). Shared by the Overview metrics
 * endpoint and the all-clients overview CSV export so both use the same
 * window. Unknown labels fall back to 30 days.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-10-05
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Extracted from server/routes/metrics.ts
 */

export function periodToDates(period: string): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().slice(0, 10);
  const days = period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}
