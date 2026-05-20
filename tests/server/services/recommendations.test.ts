import { describe, it, expect } from "vitest";
import { generateRecommendations } from "../../../server/services/recommendations";
import type { ResponseMention, ResponseCitation, ResponseSentiment } from "@shared/schema";

function mention(brandId: number, section = "body"): ResponseMention {
  return {
    id: 1, responseId: 1, brandId, matchedText: "Brand",
    matchType: "exact", section: section as ResponseMention["section"],
    recommendationRank: null, confidence: 1, evidenceExcerpt: null,
  };
}

function citation(ownedByBrandId: number | null): ResponseCitation {
  return {
    id: 1, responseId: 1, url: "https://example.com", rootDomain: "example.com",
    ownedByBrandId, position: 1, isTrustedThirdParty: false,
  };
}

function sentiment(brandId: number, label: ResponseSentiment["label"]): ResponseSentiment {
  return {
    id: 1, responseId: 1, brandId, label, score: label === "negative" ? -0.5 : 0,
    confidence: 0.8, evidenceExcerpt: null, facetLabels: [],
    reviewedByUserId: null, reviewedAt: null, overrideLabel: null, createdAt: Date.now(),
  };
}

const CLIENT_ID = 1;
const COMPETITOR_ID = 2;

// ---------------------------------------------------------------------------
describe("generateRecommendations", () => {
  it("returns empty array when no gaps detected", () => {
    const recs = generateRecommendations({
      mentions: [mention(CLIENT_ID, "summary")],
      citations: [citation(CLIENT_ID)],
      sentiments: [sentiment(CLIENT_ID, "positive")],
      clientBrandId: CLIENT_ID,
      totalResponses: 1,
    });
    expect(recs).toHaveLength(0);
  });

  it("fires mentioned-without-citation when client is mentioned but not cited", () => {
    const recs = generateRecommendations({
      mentions: [mention(CLIENT_ID)],
      citations: [],
      sentiments: [],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("mentioned-without-citation");
  });

  it("fires missing-on-category when client has no mentions at all", () => {
    const recs = generateRecommendations({
      mentions: [],
      citations: [],
      sentiments: [],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("missing-on-category");
  });

  it("fires negative-framing when client has negative sentiment", () => {
    const recs = generateRecommendations({
      mentions: [mention(CLIENT_ID)],
      citations: [citation(CLIENT_ID)],
      sentiments: [sentiment(CLIENT_ID, "negative")],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("negative-framing");
  });

  it("fires competitor-authority-advantage when competitor has more citations", () => {
    const recs = generateRecommendations({
      mentions: [mention(CLIENT_ID), mention(COMPETITOR_ID)],
      citations: [
        citation(COMPETITOR_ID),
        citation(COMPETITOR_ID),
        citation(COMPETITOR_ID),
      ],
      sentiments: [],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("competitor-authority-advantage");
  });

  it("assigns severity high for missing-on-category", () => {
    const recs = generateRecommendations({
      mentions: [],
      citations: [],
      sentiments: [],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    const missing = recs.find((r) => r.kind === "missing-on-category");
    expect(missing?.severity).toBe("high");
  });

  it("includes a suggestedAction for each recommendation", () => {
    const recs = generateRecommendations({
      mentions: [],
      citations: [],
      sentiments: [],
      clientBrandId: CLIENT_ID,
      totalResponses: 5,
    });
    for (const rec of recs) {
      expect(rec.suggestedAction.length).toBeGreaterThan(0);
    }
  });
});
