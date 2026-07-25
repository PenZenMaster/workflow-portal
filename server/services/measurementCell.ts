/*
 * Module/Script Name: measurementCell.ts
 * Path: server/services/measurementCell.ts
 *
 * Description:
 * Duplicate measurement-cell detection (issue #4 Phase 2 item 7, second
 * half). Two prompts can be near-duplicate-safe by wording yet still
 * measure the exact same thing - the same intentType + service +
 * geography + brandContext combination is the same measurement
 * question regardless of phrasing. Pure function, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #4 Phase 2 item 7 (measurement cell half) initial
 *   implementation
 */

import type { PromptIntentType, BrandContext } from "@shared/schema";

export interface MeasurementCell {
  intentType: PromptIntentType;
  service: string | null;
  geo: string | null;
  brandContext: BrandContext;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function measurementCellKey(cell: MeasurementCell): string {
  return [cell.intentType, normalize(cell.service), normalize(cell.geo), cell.brandContext].join("|");
}
