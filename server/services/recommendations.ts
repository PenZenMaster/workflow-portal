/*
 * Module/Script Name: recommendations.ts
 * Path: server/services/recommendations.ts
 *
 * Description:
 * Rule-based recommendation engine. Detects four gap types from mention,
 * citation, and sentiment data and emits prioritised recommendations with
 * evidence and suggested actions.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 6 initial implementation
 */

import type { ResponseMention, ResponseCitation, ResponseSentiment } from "@shared/schema";

export type RecommendationSeverity = "high" | "medium" | "low";

export interface Recommendation {
  kind: string;
  severity: RecommendationSeverity;
  evidence: string;
  suggestedAction: string;
}

interface RecommendationInput {
  mentions: ResponseMention[];
  citations: ResponseCitation[];
  sentiments: ResponseSentiment[];
  clientBrandId: number;
  totalResponses: number;
}

export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const { mentions, citations, sentiments, clientBrandId, totalResponses } = input;
  const recs: Recommendation[] = [];

  const clientMentions = mentions.filter((m) => m.brandId === clientBrandId);
  const clientCitations = citations.filter((c) => c.ownedByBrandId === clientBrandId);
  const competitorCitations = citations.filter(
    (c) => c.ownedByBrandId !== null && c.ownedByBrandId !== clientBrandId
  );
  const clientSentiments = sentiments.filter((s) => s.brandId === clientBrandId);

  // Rule 1: missing-on-category — not appearing in any response
  if (totalResponses > 0 && clientMentions.length === 0) {
    recs.push({
      kind: "missing-on-category",
      severity: "high",
      evidence: `Client brand not detected in any of ${totalResponses} AI responses.`,
      suggestedAction:
        "Create category-definition content, comparison pages, and ensure the brand is cited by authoritative third-party sources.",
    });
  }

  // Rule 2: mentioned-without-citation — present but domain not cited
  if (clientMentions.length > 0 && clientCitations.length === 0) {
    recs.push({
      kind: "mentioned-without-citation",
      severity: "medium",
      evidence: `Brand mentioned ${clientMentions.length} time(s) but the client domain was never directly cited.`,
      suggestedAction:
        "Strengthen entity consistency via structured data, authoritative backlinks, and ensure core pages are indexed and crawlable by AI platforms.",
    });
  }

  // Rule 3: negative-framing — majority of sentiments are negative or mixed
  const negativeCount = clientSentiments.filter(
    (s) => (s.overrideLabel ?? s.label) === "negative" || (s.overrideLabel ?? s.label) === "mixed"
  ).length;
  if (clientSentiments.length > 0 && negativeCount / clientSentiments.length > 0.4) {
    recs.push({
      kind: "negative-framing",
      severity: "high",
      evidence: `${negativeCount} of ${clientSentiments.length} sentiment classification(s) are negative or mixed.`,
      suggestedAction:
        "Review reputation inputs, testimonials, and review management. Audit and update outdated pages that may be feeding negative framing.",
    });
  }

  // Rule 4: competitor-authority-advantage — competitor cited more than client
  if (competitorCitations.length > clientCitations.length + 1) {
    recs.push({
      kind: "competitor-authority-advantage",
      severity: "medium",
      evidence: `Competitors have ${competitorCitations.length} citation(s) vs ${clientCitations.length} for the client.`,
      suggestedAction:
        "Pursue authoritative third-party mentions, data-backed content, and citations from the same high-authority domains that reference competitors.",
    });
  }

  return recs;
}
