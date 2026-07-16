/*
 * Module/Script Name: scoring.ts
 * Path: server/services/scoring.ts
 *
 * Description:
 * Computes the AI Visibility scoring formula (M+S+R+C+T) and derived
 * aggregate metrics (citation frequency, mention rate, AI SoV). Weights
 * are configurable per client; defaults defined here.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 * - v1.01 YLG slice b: computeRecommendationRate
 */

import type { ResponseMention, ResponseCitation } from "@shared/schema";

// Bumped whenever the scoring formula or default weights change — recorded
// on run manifests for comparability (issue #3 Epic 2).
export const SCORING_VERSION = "1.0";

export const DEFAULT_WEIGHTS = {
  mentionPresent: 1,      // M — mentioned anywhere in the response
  summaryBlock: 2,        // S — mentioned in the opening summary block
  firstRecommended: 3,    // R — listed as the first recommendation
  clientDomainCitation: 2, // C — client-owned domain directly cited
  trustedThirdParty: 1,   // T — a trusted third-party source supports the client area
};

export type ScoringWeights = typeof DEFAULT_WEIGHTS;

/**
 * Compute the Prompt Visibility Score (M+S+R+C+T) for one response.
 * clientBrandId identifies which brand in the mention/citation lists is the tracked client.
 */
export function computeVisibilityScore(
  mentions: ResponseMention[],
  citations: ResponseCitation[],
  clientBrandId: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  let score = 0;

  const clientMentions = mentions.filter((m) => m.brandId === clientBrandId);

  // M: mentioned anywhere
  if (clientMentions.length > 0) score += weights.mentionPresent;

  // S: mentioned in the opening summary block
  if (clientMentions.some((m) => m.section === "summary")) score += weights.summaryBlock;

  // R: ranked first in a list
  if (clientMentions.some((m) => m.recommendationRank === 1)) score += weights.firstRecommended;

  // C: client domain directly cited
  if (citations.some((c) => c.ownedByBrandId === clientBrandId)) {
    score += weights.clientDomainCitation;
  }

  // T: trusted third-party citation present
  if (citations.some((c) => c.isTrustedThirdParty)) score += weights.trustedThirdParty;

  return score;
}

/** Citation Frequency = (responses citing client / total responses) × 100 */
export function computeCitationFrequency(cited: number, total: number): number {
  if (total === 0) return 0;
  return (cited / total) * 100;
}

/** Mention Rate = (responses mentioning or citing client / total responses) × 100 */
export function computeMentionRate(mentioned: number, total: number): number {
  if (total === 0) return 0;
  return (mentioned / total) * 100;
}

/** AI Share of Voice = (client mentions / all brand mentions) × 100 */
export function computeAISoV(clientMentions: number, allBrandMentions: number): number {
  if (allBrandMentions === 0) return 0;
  return (clientMentions / allBrandMentions) * 100;
}

/** Recommendation Rate = (responses recommending client / total responses) × 100 */
export function computeRecommendationRate(recommended: number, total: number): number {
  if (total === 0) return 0;
  return (recommended / total) * 100;
}
