/*
 * Module/Script Name: collectionDiagnostics.test.ts
 * Path: tests/server/services/collectionDiagnostics.test.ts
 *
 * Description:
 * Tests for computeCollectionDiagnostics - the pre-activation
 * methodology summary for a collection's persisted prompts (issue #4
 * Phase 3 item J, slice 5).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-29
 * Last Modified Date: 2026-07-29
 * Comments:
 * - v1.00 issue #4 Phase 3 slice 5 initial implementation
 */

import { describe, it, expect } from "vitest";
import { computeCollectionDiagnostics } from "../../../server/services/collectionDiagnostics";
import type { Prompt } from "../../../shared/schema";

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: 1,
    collectionId: 1,
    text: "Who repairs water heaters in Seattle?",
    category: "local",
    funnelStage: "awareness",
    geo: null,
    deviceContext: null,
    priorityWeight: 1,
    status: "active",
    targetPlatforms: [],
    position: 0,
    intentType: null,
    brandInPrompt: null,
    brandContext: null,
    service: null,
    promptFamily: null,
    commercialValue: null,
    measurementPurpose: null,
    generationRunId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("computeCollectionDiagnostics", () => {
  it("counts prompts and buckets null intentType/brandContext as unclassified", () => {
    const prompts = [
      makePrompt({ id: 1, intentType: "provider_recommendation", brandContext: "unbranded" }),
      makePrompt({ id: 2, intentType: null, brandContext: null, text: "A different prompt entirely" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");

    expect(diagnostics.promptCount).toBe(2);
    expect(diagnostics.intentDistribution).toEqual({ provider_recommendation: 1, unclassified: 1 });
    expect(diagnostics.brandContextDistribution).toEqual({ unbranded: 1, unclassified: 1 });
  });

  it("summarizes funnelStage distribution", () => {
    const prompts = [
      makePrompt({ id: 1, funnelStage: "awareness", text: "Prompt one" }),
      makePrompt({ id: 2, funnelStage: "awareness", text: "Prompt two" }),
      makePrompt({ id: 3, funnelStage: "decision", text: "Prompt three" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.funnelStageDistribution).toEqual({ awareness: 2, decision: 1 });
  });

  it("lists distinct non-null geo and service coverage", () => {
    const prompts = [
      makePrompt({ id: 1, geo: "Seattle, WA", service: "drain cleaning", text: "Prompt one" }),
      makePrompt({ id: 2, geo: "Seattle, WA", service: "water heater repair", text: "Prompt two" }),
      makePrompt({ id: 3, geo: null, service: null, text: "Prompt three" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.geoCoverage).toEqual(["Seattle, WA"]);
    expect(diagnostics.serviceCoverage.sort()).toEqual(["drain cleaning", "water heater repair"]);
  });

  it("groups normalized-exact-duplicate prompt texts", () => {
    const prompts = [
      makePrompt({ id: 1, text: "Who are the best plumbers in Seattle?" }),
      makePrompt({ id: 2, text: "who are the best plumbers in seattle" }),
      makePrompt({ id: 3, text: "A totally unrelated prompt" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.duplicateGroups).toHaveLength(1);
    expect(diagnostics.duplicateGroups[0].sort()).toEqual(
      ["Who are the best plumbers in Seattle?", "who are the best plumbers in seattle"].sort()
    );
  });

  it("flags near-duplicate pairs that are not already exact duplicates", () => {
    // Same token set, different word order - not caught by normalizePromptText
    // (case/punctuation/whitespace only), but a 100% Jaccard match.
    const prompts = [
      makePrompt({ id: 1, text: "Best plumbers in Seattle for emergency repairs" }),
      makePrompt({ id: 2, text: "Emergency repairs best plumbers in Seattle" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.duplicateGroups).toEqual([]);
    expect(diagnostics.nearDuplicatePairs).toHaveLength(1);
    expect(diagnostics.nearDuplicatePairs[0].similarityPct).toBeGreaterThanOrEqual(75);
  });

  it("does not double-count an exact-duplicate pair as also near-duplicate", () => {
    const prompts = [
      makePrompt({ id: 1, text: "Who are the best plumbers in Seattle?" }),
      makePrompt({ id: 2, text: "who are the best plumbers in seattle" }),
    ];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.duplicateGroups).toHaveLength(1);
    expect(diagnostics.nearDuplicatePairs).toHaveLength(0);
  });

  it("resolves quotaShortfall against promptCount, using only classified prompts to fill cells", () => {
    // balanced_baseline at count 1 resolves entirely to provider_recommendation: 1
    const prompts = [makePrompt({ id: 1, intentType: null })];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.quotaShortfall.provider_recommendation).toBe(1);
  });

  it("reports an empty quotaShortfall when the collection's classified prompts satisfy the resolved quotas", () => {
    const prompts = [makePrompt({ id: 1, intentType: "provider_recommendation" })];
    const diagnostics = computeCollectionDiagnostics(prompts, "balanced_baseline");
    expect(diagnostics.quotaShortfall).toEqual({});
  });

  it("handles an empty collection without throwing", () => {
    const diagnostics = computeCollectionDiagnostics([], "balanced_baseline");
    expect(diagnostics.promptCount).toBe(0);
    expect(diagnostics.quotaShortfall).toEqual({});
    expect(diagnostics.duplicateGroups).toEqual([]);
    expect(diagnostics.nearDuplicatePairs).toEqual([]);
  });
});
