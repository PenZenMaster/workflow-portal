/*
 * Module/Script Name: panelTypeQuotas.ts
 * Path: server/services/panelTypeQuotas.ts
 *
 * Description:
 * Ratio-based per-panel-type quota distributions (issue #4 Phase 3 item
 * 9, slice 1) and the resolver that turns a ratio table into exact
 * per-intent integer counts for whatever prompt count is requested.
 * Ratios (not fixed totals) so the existing 1-50 generate-prompts count
 * field stays meaningful - a fixed panelSize (as prompt_methodologies
 * uses) would silently mismatch any requested count other than that
 * exact number. Ratios locked with the user 2026-07-28.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-28
 * Last Modified Date: 2026-07-28
 * Comments:
 * - v1.00 issue #4 Phase 3 slice 1 initial implementation
 */

import type { PromptPanelType, PromptIntentType } from "@shared/schema";

export type PanelBrandConstraint =
  | "baseline_mix" // 80/20 unbranded/branded split, same as today's default generator behavior
  | "unbranded_only"
  | "client_branded_only"
  | "competitor_branded_only";

export interface PanelTypeQuotaRatios {
  intentRatios: Partial<Record<PromptIntentType, number>>; // sums to ~1.0
  brandConstraint: PanelBrandConstraint;
}

export interface ResolvedPanelQuotas {
  panelType: PromptPanelType;
  count: number;
  intentCounts: Partial<Record<PromptIntentType, number>>; // integers, sums exactly to count
  brandConstraint: PanelBrandConstraint;
}

// Converted from the existing METHODOLOGY_V2_QUOTAS 30-panel absolute
// counts (server/storage/promptMethodologyStore.ts) so balanced_baseline
// reproduces today's generator behavior exactly.
const BALANCED_BASELINE_RATIOS: Partial<Record<PromptIntentType, number>> = {
  provider_recommendation: 7 / 30,
  service_specific: 5 / 30,
  problem_solution: 4 / 30,
  geographic_discovery: 4 / 30,
  educational: 4 / 30,
  trust_validation: 2 / 30,
  comparison: 2 / 30,
  brand_validation: 1 / 30,
  alternative: 1 / 30,
};

export const PANEL_TYPE_QUOTAS: Record<PromptPanelType, PanelTypeQuotaRatios> = {
  balanced_baseline: {
    intentRatios: BALANCED_BASELINE_RATIOS,
    brandConstraint: "baseline_mix",
  },
  // "Market Discovery Baseline" example from issue #4 Section A (20/15/
  // 15/15/10/10 of 85): pure discovery, client/competitor names
  // prohibited entirely. Kept as exact fractions of 85, not rounded
  // decimals, so the ratios sum to exactly 1.
  discovery: {
    intentRatios: {
      problem_solution: 20 / 85,
      provider_recommendation: 15 / 85,
      service_specific: 15 / 85,
      geographic_discovery: 15 / 85,
      educational: 10 / 85,
      trust_validation: 10 / 85,
    },
    brandConstraint: "unbranded_only",
  },
  // Split out of the issue's combined "Entity and Competitive Audit"
  // example: entity_audit validates the client's own entity/brand is
  // recognized (client_branded only).
  entity_audit: {
    intentRatios: {
      brand_validation: 0.5,
      trust_validation: 0.25,
      provider_recommendation: 0.25,
    },
    brandConstraint: "client_branded_only",
  },
  // Other half of the combined example: competitive validates against
  // named competitors (competitor_branded only).
  competitive: {
    intentRatios: {
      comparison: 0.55,
      alternative: 0.3,
      brand_validation: 0.15,
    },
    brandConstraint: "competitor_branded_only",
  },
  topic_authority: {
    intentRatios: {
      educational: 0.6,
      problem_solution: 0.25,
      trust_validation: 0.15,
    },
    brandConstraint: "unbranded_only",
  },
  local_commercial: {
    intentRatios: {
      geographic_discovery: 0.35,
      service_specific: 0.3,
      provider_recommendation: 0.25,
      problem_solution: 0.1,
    },
    brandConstraint: "baseline_mix",
  },
};

// Largest-remainder rounding: floor every ratio*count, then hand out the
// leftover units (count minus the sum of floors) to the entries with the
// largest fractional remainder, so the result always sums exactly to
// count regardless of rounding.
function distributeCounts(
  ratios: Partial<Record<PromptIntentType, number>>,
  count: number
): Partial<Record<PromptIntentType, number>> {
  const entries = Object.entries(ratios) as [PromptIntentType, number][];
  const raw = entries.map(([key, ratio]) => {
    const value = ratio * count;
    return { key, floor: Math.floor(value), remainder: value - Math.floor(value) };
  });

  const result: Partial<Record<PromptIntentType, number>> = {};
  for (const r of raw) result[r.key] = r.floor;

  const allocated = raw.reduce((sum, r) => sum + r.floor, 0);
  let remaining = count - allocated;

  const byRemainderDesc = [...raw].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining && i < byRemainderDesc.length; i++) {
    const key = byRemainderDesc[i].key;
    result[key] = (result[key] ?? 0) + 1;
  }

  return result;
}

export function resolvePanelTypeQuotas(panelType: PromptPanelType, count: number): ResolvedPanelQuotas {
  const table = PANEL_TYPE_QUOTAS[panelType];
  return {
    panelType,
    count,
    intentCounts: distributeCounts(table.intentRatios, count),
    brandConstraint: table.brandConstraint,
  };
}
