/*
 * Module/Script Name: recommendation.ts
 * Path: server/services/recommendation.ts
 *
 * Description:
 * Deterministic recommendation classifier (YLG visibility spec section
 * 6.2). Classifies a brand's presence in one AI response into a 7-status
 * scale using structural signals (numbered-list rank, list section) and
 * keyword patterns in the mention evidence excerpts. Negative signals
 * take precedence over positives; structural rank beats keyword-only
 * signals. An LLM classifier for ambiguous prose is a planned follow-up;
 * this version is rules-only and fully reproducible.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG classifier sprint initial implementation
 */

import type { RecommendationStatus } from "@shared/schema";

export const RECOMMENDATION_CLASSIFIER_VERSION = "rules-1.0";

export interface MentionSignal {
  section: "summary" | "list" | "body";
  recommendationRank: number | null;
  evidenceExcerpt: string | null;
}

export interface RecommendationClassification {
  status: RecommendationStatus;
  rank: number | null;
  confidence: number;
  evidenceExcerpt: string | null;
}

// Checked before positive patterns: "not recommended" must never match
// the plain "recommend" rule.
const NEGATIVE_PATTERN =
  /\b(avoid|not recommended|would(?: not|n't) recommend|steer clear|stay away|poor (?:reviews|reputation|service)|many complaints|complaints about|disqualified|unreliable|worst)\b/i;

const STRONG_PATTERN =
  /\b(highly recommend|strongly recommend|best overall|top (?:choice|pick|rated)|leading|standout|best option|first choice|number one)\b/i;

const RECOMMEND_PATTERN =
  /\b(recommend|suggest(?:ed)?|great (?:choice|option|pick)|good (?:choice|option)|excellent (?:choice|option)|solid (?:choice|option)|worth considering)\b/i;

// Status strength for picking the winning signal across mentions.
const STATUS_STRENGTH: Record<RecommendationStatus, number> = {
  negative_or_excluded: 7,
  first_choice: 6,
  strongly_recommended: 5,
  recommended: 4,
  listed_option: 3,
  incidental_mention: 2,
  not_mentioned: 1,
};

interface Signal {
  status: RecommendationStatus;
  confidence: number;
  evidenceExcerpt: string | null;
}

function classifyMention(mention: MentionSignal): Signal {
  const excerpt = mention.evidenceExcerpt ?? "";

  if (NEGATIVE_PATTERN.test(excerpt)) {
    return { status: "negative_or_excluded", confidence: 0.8, evidenceExcerpt: mention.evidenceExcerpt };
  }
  if (mention.recommendationRank === 1) {
    return { status: "first_choice", confidence: 0.9, evidenceExcerpt: mention.evidenceExcerpt };
  }
  if (mention.recommendationRank !== null) {
    return { status: "listed_option", confidence: 0.9, evidenceExcerpt: mention.evidenceExcerpt };
  }
  if (STRONG_PATTERN.test(excerpt)) {
    return { status: "strongly_recommended", confidence: 0.8, evidenceExcerpt: mention.evidenceExcerpt };
  }
  if (RECOMMEND_PATTERN.test(excerpt)) {
    return { status: "recommended", confidence: 0.7, evidenceExcerpt: mention.evidenceExcerpt };
  }
  if (mention.section === "list") {
    return { status: "listed_option", confidence: 0.7, evidenceExcerpt: mention.evidenceExcerpt };
  }
  return { status: "incidental_mention", confidence: 0.6, evidenceExcerpt: mention.evidenceExcerpt };
}

export function classifyRecommendation(mentions: MentionSignal[]): RecommendationClassification {
  if (mentions.length === 0) {
    return { status: "not_mentioned", rank: null, confidence: 1.0, evidenceExcerpt: null };
  }

  let winner: Signal | null = null;
  for (const mention of mentions) {
    const signal = classifyMention(mention);
    if (!winner || STATUS_STRENGTH[signal.status] > STATUS_STRENGTH[winner.status]) {
      winner = signal;
    }
  }

  const ranks = mentions
    .map((m) => m.recommendationRank)
    .filter((r): r is number => r !== null);
  const rank = ranks.length > 0 ? Math.min(...ranks) : null;

  return {
    status: winner!.status,
    rank,
    confidence: winner!.confidence,
    evidenceExcerpt: winner!.evidenceExcerpt,
  };
}
