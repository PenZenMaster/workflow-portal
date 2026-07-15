import { describe, it, expect } from "vitest";
import {
  computeVisibilityScore,
  computeCitationFrequency,
  computeMentionRate,
  computeAISoV,
  computeRecommendationRate,
  DEFAULT_WEIGHTS,
} from "../../../server/services/scoring";
import { RECOMMENDED_STATUSES } from "@shared/schema";
import type { ResponseMention, ResponseCitation } from "@shared/schema";

function mention(brandId: number, section: ResponseMention["section"], rank?: number): ResponseMention {
  return {
    id: 1,
    responseId: 1,
    brandId,
    matchedText: "Brand",
    matchType: "exact",
    section,
    recommendationRank: rank ?? null,
    confidence: 1,
    evidenceExcerpt: null,
  };
}

function citation(ownedByBrandId: number | null, isTrustedThirdParty = false): ResponseCitation {
  return {
    id: 1,
    responseId: 1,
    url: "https://example.com",
    rootDomain: "example.com",
    ownedByBrandId,
    position: 1,
    isTrustedThirdParty,
  };
}

const CLIENT_ID = 1;

// ---------------------------------------------------------------------------
describe("computeVisibilityScore", () => {
  it("returns 0 when client is not mentioned or cited", () => {
    expect(computeVisibilityScore([], [], CLIENT_ID)).toBe(0);
  });

  it("adds M (1) when client is mentioned in body", () => {
    const score = computeVisibilityScore([mention(CLIENT_ID, "body")], [], CLIENT_ID);
    expect(score).toBe(DEFAULT_WEIGHTS.mentionPresent); // 1
  });

  it("adds M + S when client is mentioned in summary", () => {
    const score = computeVisibilityScore([mention(CLIENT_ID, "summary")], [], CLIENT_ID);
    expect(score).toBe(DEFAULT_WEIGHTS.mentionPresent + DEFAULT_WEIGHTS.summaryBlock); // 3
  });

  it("adds M + R when client is first recommendation", () => {
    const score = computeVisibilityScore([mention(CLIENT_ID, "list", 1)], [], CLIENT_ID);
    expect(score).toBe(DEFAULT_WEIGHTS.mentionPresent + DEFAULT_WEIGHTS.firstRecommended); // 4
  });

  it("adds C when client domain is directly cited", () => {
    const score = computeVisibilityScore([], [citation(CLIENT_ID)], CLIENT_ID);
    expect(score).toBe(DEFAULT_WEIGHTS.clientDomainCitation); // 2
  });

  it("adds T when a trusted third-party cites the client area", () => {
    const score = computeVisibilityScore([], [citation(null, true)], CLIENT_ID);
    expect(score).toBe(DEFAULT_WEIGHTS.trustedThirdParty); // 1
  });

  it("adds all components for a perfect response", () => {
    const mentions = [mention(CLIENT_ID, "summary", 1)];
    const citations = [citation(CLIENT_ID), citation(null, true)];
    const score = computeVisibilityScore(mentions, citations, CLIENT_ID);
    // M(1) + S(2) + R(3) + C(2) + T(1) = 9
    expect(score).toBe(9);
  });

  it("respects custom weight overrides", () => {
    const custom = { ...DEFAULT_WEIGHTS, mentionPresent: 5 };
    const score = computeVisibilityScore([mention(CLIENT_ID, "body")], [], CLIENT_ID, custom);
    expect(score).toBe(5);
  });

  it("does not count competitor mention as client mention", () => {
    const score = computeVisibilityScore([mention(99, "summary", 1)], [], CLIENT_ID);
    expect(score).toBe(0);
  });
});

describe("computeCitationFrequency", () => {
  it("returns 0 when no responses", () => {
    expect(computeCitationFrequency(0, 0)).toBe(0);
  });

  it("returns 100 when all responses cite the client", () => {
    expect(computeCitationFrequency(10, 10)).toBe(100);
  });

  it("returns 50 when half of responses cite the client", () => {
    expect(computeCitationFrequency(5, 10)).toBe(50);
  });

  it("rounds to two decimal places", () => {
    const result = computeCitationFrequency(1, 3);
    expect(Math.round(result * 100) / 100).toBeCloseTo(33.33, 1);
  });
});

describe("computeMentionRate", () => {
  it("returns 0 when no responses", () => {
    expect(computeMentionRate(0, 0)).toBe(0);
  });

  it("returns 75 when 3 of 4 responses mention client", () => {
    expect(computeMentionRate(3, 4)).toBe(75);
  });
});

describe("computeAISoV", () => {
  it("returns 0 when no brand mentions exist", () => {
    expect(computeAISoV(0, 0)).toBe(0);
  });

  it("returns 100 when client has all mentions", () => {
    expect(computeAISoV(10, 10)).toBe(100);
  });

  it("computes clientMentions / allBrandMentions × 100", () => {
    expect(computeAISoV(3, 12)).toBeCloseTo(25, 5);
  });
});

// ---------------------------------------------------------------------------
describe("computeRecommendationRate", () => {
  it("returns the percentage of recommended responses", () => {
    expect(computeRecommendationRate(5, 20)).toBe(25);
  });

  it("returns 0 when there are no responses", () => {
    expect(computeRecommendationRate(0, 0)).toBe(0);
  });
});

describe("RECOMMENDED_STATUSES", () => {
  it("is exactly recommended-and-up (excludes listed_option)", () => {
    expect([...RECOMMENDED_STATUSES]).toEqual([
      "recommended",
      "strongly_recommended",
      "first_choice",
    ]);
  });
});
