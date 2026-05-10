/*
 * Module/Script Name: sentiment.ts
 * Path: server/services/sentiment.ts
 *
 * Description:
 * Rule-based sentiment classifier. Scans evidence text for positive,
 * negative, and facet marker keywords. Returns label, score (-1..+1),
 * confidence, facets, and a needsReview flag (confidence < 0.6).
 * No external model dependencies — all logic is local keyword matching.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import type { SentimentLabel } from "@shared/schema";

const POSITIVE_MARKERS = [
  "best", "trusted", "leading", "top", "excellent", "great", "recommended",
  "award-winning", "professional", "expert", "reliable", "outstanding",
  "top-rated", "highly rated", "exceptional", "superior", "impressive",
];

const NEGATIVE_MARKERS = [
  "poor", "bad", "expensive", "overpriced", "slow", "disappointing",
  "not ideal", "avoid", "unreliable", "mediocre", "worst", "terrible",
  "low quality", "inadequate", "subpar",
];

const FACET_MARKERS: Record<string, string[]> = {
  trust: ["trusted", "reliable", "reputable", "certified", "verified"],
  quality: ["quality", "excellent", "outstanding", "best", "superior", "exceptional"],
  price: ["expensive", "overpriced", "affordable", "cost", "pricing", "budget"],
  expertise: ["expert", "professional", "specialist", "experienced", "knowledge"],
  speed: ["fast", "quick", "slow", "responsive", "rapid"],
  support: ["support", "customer service", "helpful", "team", "assistance"],
};

const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  confidence: number;
  evidenceExcerpt: string | null;
  facetLabels: string[];
  needsReview: boolean;
}

export function classifySentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();

  const positiveHits = POSITIVE_MARKERS.filter((m) => lower.includes(m));
  const negativeHits = NEGATIVE_MARKERS.filter((m) => lower.includes(m));

  const posCount = positiveHits.length;
  const negCount = negativeHits.length;
  const totalHits = posCount + negCount;

  let label: SentimentLabel;
  let score: number;

  if (totalHits === 0) {
    label = "neutral";
    score = 0;
  } else if (posCount > 0 && negCount > 0) {
    label = "mixed";
    score = (posCount - negCount) / totalHits;
  } else if (posCount > 0) {
    label = "positive";
    score = Math.min(posCount / totalHits, 1);
  } else {
    label = "negative";
    score = -Math.min(negCount / totalHits, 1);
  }

  // Confidence grows with more marker hits; no markers → 0.3 (low confidence).
  const confidence =
    totalHits === 0 ? 0.3 : Math.min(0.3 + totalHits * 0.15, 1.0);

  const facetLabels = Object.entries(FACET_MARKERS)
    .filter(([, markers]) => markers.some((m) => lower.includes(m)))
    .map(([facet]) => facet);

  return {
    label,
    score: Math.round(score * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    evidenceExcerpt: text.slice(0, 200),
    facetLabels,
    needsReview: confidence < REVIEW_CONFIDENCE_THRESHOLD,
  };
}
