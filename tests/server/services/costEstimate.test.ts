/*
 * Module/Script Name: costEstimate.test.ts
 * Path: tests/server/services/costEstimate.test.ts
 *
 * Description:
 * Tests for estimateCostUsd - issue #35 slice 4 (provider request ID +
 * estimated cost).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 issue #35 slice 4
 */

import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../../../server/services/costEstimate";

describe("estimateCostUsd", () => {
  it("computes cost from a known model's input/output pricing", () => {
    // openai/gpt-4o: $2.50/$10.00 per 1M tokens (as of 2026-08-17)
    const cost = estimateCostUsd("openai", "gpt-4o", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(2.5 + 10, 6);
  });

  it("prices input and output tokens independently, not at a single blended rate", () => {
    const cost = estimateCostUsd("openai", "gpt-4o-mini", { inputTokens: 500_000, outputTokens: 0 });
    // gpt-4o-mini: $0.15/1M input
    expect(cost).toBeCloseTo(0.075, 6);
  });

  it("returns null when the platform has no pricing entry at all", () => {
    const cost = estimateCostUsd("unknown-platform", "some-model", { inputTokens: 100, outputTokens: 100 });
    expect(cost).toBeNull();
  });

  it("returns null when the model isn't in the platform's pricing table (unknown/unpriced model)", () => {
    const cost = estimateCostUsd("openai", "gpt-3.5-turbo-not-priced", { inputTokens: 100, outputTokens: 100 });
    expect(cost).toBeNull();
  });

  it("returns null when usage is null (no token counts to price)", () => {
    const cost = estimateCostUsd("openai", "gpt-4o", null);
    expect(cost).toBeNull();
  });

  it("returns null when model is null (response never reached an adapter)", () => {
    const cost = estimateCostUsd("openai", null, { inputTokens: 100, outputTokens: 100 });
    expect(cost).toBeNull();
  });
});
