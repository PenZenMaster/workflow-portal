/*
 * Module/Script Name: recommendation.test.ts
 * Path: tests/server/services/recommendation.test.ts
 *
 * Description:
 * Deterministic recommendation-classifier tests. The fixtures double as
 * the start of the YLG golden dataset: numbered lists, bullets, prose
 * recommendations, negative statements, and plain mentions.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG classifier sprint initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  classifyRecommendation,
  RECOMMENDATION_CLASSIFIER_VERSION,
  type MentionSignal,
} from "../../../server/services/recommendation";

function signal(overrides: Partial<MentionSignal> = {}): MentionSignal {
  return {
    section: "body",
    recommendationRank: null,
    evidenceExcerpt: "Acme Plumbing is one of several providers in the Seattle area",
    ...overrides,
  };
}

describe("classifyRecommendation (golden dataset)", () => {
  it("exports a classifier version for provenance", () => {
    expect(RECOMMENDATION_CLASSIFIER_VERSION).toMatch(/^rules-/);
  });

  it("returns not_mentioned when the brand has no mentions", () => {
    const result = classifyRecommendation([]);
    expect(result.status).toBe("not_mentioned");
    expect(result.rank).toBeNull();
    expect(result.confidence).toBe(1.0);
    expect(result.evidenceExcerpt).toBeNull();
  });

  it("classifies rank 1 in a numbered list as first_choice", () => {
    const result = classifyRecommendation([
      signal({ section: "list", recommendationRank: 1, evidenceExcerpt: "1. Acme Plumbing - reliable emergency service" }),
    ]);
    expect(result.status).toBe("first_choice");
    expect(result.rank).toBe(1);
    expect(result.confidence).toBe(0.9);
  });

  it("classifies a lower numbered-list rank as listed_option", () => {
    const result = classifyRecommendation([
      signal({ section: "list", recommendationRank: 3, evidenceExcerpt: "3. Acme Plumbing - solid mid-range option" }),
    ]);
    expect(result.status).toBe("listed_option");
    expect(result.rank).toBe(3);
    expect(result.confidence).toBe(0.9);
  });

  it("classifies a list-section mention without a rank (bullets) as listed_option", () => {
    const result = classifyRecommendation([
      signal({ section: "list", evidenceExcerpt: "- Acme Plumbing (Seattle) - drain and sewer work" }),
    ]);
    expect(result.status).toBe("listed_option");
    expect(result.rank).toBeNull();
    expect(result.confidence).toBe(0.7);
  });

  it("classifies prose 'highly recommend' as strongly_recommended", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Most homeowners highly recommend Acme Plumbing for emergency repairs" }),
    ]);
    expect(result.status).toBe("strongly_recommended");
    expect(result.confidence).toBe(0.8);
  });

  it("classifies prose 'best overall' as strongly_recommended", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Acme Plumbing is the best overall choice for water heater installs" }),
    ]);
    expect(result.status).toBe("strongly_recommended");
  });

  it("classifies plain prose 'recommend' as recommended", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "I would recommend Acme Plumbing if you need same-day service" }),
    ]);
    expect(result.status).toBe("recommended");
    expect(result.confidence).toBe(0.7);
  });

  it("classifies 'not recommended' as negative_or_excluded, not recommended", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Acme Plumbing is not recommended for large commercial jobs" }),
    ]);
    expect(result.status).toBe("negative_or_excluded");
    expect(result.confidence).toBe(0.8);
  });

  it("classifies 'avoid' plus complaints as negative_or_excluded even when ranked", () => {
    const result = classifyRecommendation([
      signal({ section: "list", recommendationRank: 1, evidenceExcerpt: "1. Acme Plumbing - avoid; many complaints about billing" }),
    ]);
    expect(result.status).toBe("negative_or_excluded");
  });

  it("classifies a plain body mention as incidental_mention", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Acme Plumbing is located in the Ballard neighborhood" }),
    ]);
    expect(result.status).toBe("incidental_mention");
    expect(result.confidence).toBe(0.6);
  });

  it("takes the strongest signal and best rank across multiple mentions", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Acme Plumbing also serves Tacoma" }),
      signal({ section: "list", recommendationRank: 3, evidenceExcerpt: "3. Acme Plumbing" }),
      signal({ section: "list", recommendationRank: 1, evidenceExcerpt: "1. Acme Plumbing - top pick" }),
    ]);
    expect(result.status).toBe("first_choice");
    expect(result.rank).toBe(1);
  });

  it("returns the evidence excerpt of the winning mention", () => {
    const result = classifyRecommendation([
      signal({ evidenceExcerpt: "Acme Plumbing also serves Tacoma" }),
      signal({ evidenceExcerpt: "Experts highly recommend Acme Plumbing for gas lines" }),
    ]);
    expect(result.evidenceExcerpt).toBe("Experts highly recommend Acme Plumbing for gas lines");
  });
});
