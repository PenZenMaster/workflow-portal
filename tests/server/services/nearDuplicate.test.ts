/*
 * Module/Script Name: nearDuplicate.test.ts
 * Path: tests/server/services/nearDuplicate.test.ts
 *
 * Description:
 * Tests for issue #4 Phase 2 item 7 - semantic near-duplicate detection
 * (token/Jaccard similarity, first pass per the issue's own "may use
 * token/Jaccard similarity" framing - no stemming).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #4 Phase 2 item 7 initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  tokenize,
  jaccardSimilarity,
  isNearDuplicate,
  DEFAULT_NEAR_DUPLICATE_THRESHOLD,
} from "../../../server/services/nearDuplicate";

describe("tokenize", () => {
  it("lowercases, strips punctuation, and splits on whitespace", () => {
    expect(tokenize("Best Plumbers, in Seattle!")).toEqual(new Set(["best", "plumbers", "seattle"]));
  });

  it("removes common stopwords (articles, pronouns, prepositions, interrogatives)", () => {
    expect(tokenize("Who are the best plumbers in Seattle?")).toEqual(new Set(["best", "plumbers", "seattle"]));
  });

  it("returns an empty set for a stopword-only string", () => {
    expect(tokenize("who is the")).toEqual(new Set());
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical text", () => {
    expect(jaccardSimilarity("Best plumbers in Seattle", "Best plumbers in Seattle")).toBe(1);
  });

  it("returns 1 when reordering/rephrasing with stopwords produces the same content tokens", () => {
    const a = "Who are the best plumbers in Seattle?";
    const b = "Which plumbers in Seattle are the best?";
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for completely disjoint content", () => {
    const a = "What are common signs of a slab leak?";
    const b = "Who are the best plumbers in Seattle?";
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns a partial ratio for partial overlap", () => {
    // {best, plumbers, seattle} vs {best, plumbers, near, seattle}: 3/4
    const a = "Best plumbers in Seattle";
    const b = "Best plumbers near Seattle";
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.75, 5);
  });

  it("returns 0 when both texts reduce to only stopwords", () => {
    expect(jaccardSimilarity("who is the", "what was it")).toBe(0);
  });
});

describe("isNearDuplicate", () => {
  it("uses a default threshold of 0.75", () => {
    expect(DEFAULT_NEAR_DUPLICATE_THRESHOLD).toBe(0.75);
  });

  it("returns true at or above the threshold", () => {
    const a = "Best plumbers in Seattle";
    const b = "Best plumbers near Seattle"; // Jaccard 0.75
    expect(isNearDuplicate(a, b)).toBe(true);
  });

  it("returns false below the threshold", () => {
    const a = "What are common signs of a slab leak?";
    const b = "Who are the best plumbers in Seattle?";
    expect(isNearDuplicate(a, b)).toBe(false);
  });

  it("honors a custom threshold", () => {
    const a = "Best plumbers in Seattle";
    const b = "Best plumbers near Seattle"; // Jaccard 0.75
    expect(isNearDuplicate(a, b, 0.8)).toBe(false);
    expect(isNearDuplicate(a, b, 0.75)).toBe(true);
  });
});
