import { describe, it, expect } from "vitest";
import { computeMeasurementHealth } from "../../../server/services/measurementHealth";
import type {
  PromptRun,
  MeasurementRunManifest,
  ComparabilityResult,
  CollectionDiagnostics,
  ClientReadiness,
} from "@shared/schema";

const RUN: PromptRun = {
  id: 5,
  clientId: 10,
  collectionId: 5,
  batchId: "batch-001",
  status: "complete",
  triggeredBy: "manual",
  triggeredByUserId: 1,
  totalPrompts: 10,
  completedPrompts: 10,
  failedPrompts: 0,
  startedAt: Date.now(),
  finishedAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const MANIFEST: MeasurementRunManifest = {
  id: 7,
  runId: 5,
  clientId: 10,
  collectionId: 5,
  purpose: "ad_hoc",
  methodologyVersion: "1.0",
  panelVersion: "3",
  scoringVersion: "1.0",
  parserVersion: "1.0",
  classifierVersion: "rules-1.0",
  platformIds: [1, 4],
  promptCount: 10,
  replicateCount: 1,
  expectedResponseCount: 20,
  configSnapshot: "{}",
  configHash: "aa",
  createdAt: Date.now(),
};

const CLEAN_DIAGNOSTICS: CollectionDiagnostics = {
  promptCount: 10,
  intentDistribution: { provider_recommendation: 10 },
  brandContextDistribution: { unbranded: 10 },
  funnelStageDistribution: { awareness: 10 },
  geoCoverage: ["Seattle, WA"],
  serviceCoverage: ["drain cleaning"],
  duplicateGroups: [],
  nearDuplicatePairs: [],
  quotaShortfall: {},
  phrasingDistribution: {},
};

const CLEAN_READINESS: ClientReadiness = {
  clientId: 10,
  hasClientBrand: true,
  competitorBrandCount: 3,
  competitorBrandsWithAliasCount: 3,
  hasActivePromptCollectionWithPrompts: true,
  ready: true,
  issues: [],
};

// issue #30 slice 3
const CLEAN_SOURCE_COMPLETENESS = { citationCount: 10, unclassifiedCount: 0 };

function comparability(status: ComparabilityResult["status"]): ComparabilityResult {
  return { status, baseRunId: 3, currentRunId: 5, reasons: [] };
}

function baseInputs(overrides: Partial<Parameters<typeof computeMeasurementHealth>[0]> = {}) {
  return {
    run: RUN,
    manifest: MANIFEST,
    comparability: comparability("fully_comparable"),
    completedPlatformIds: [1, 4],
    collectionDiagnostics: CLEAN_DIAGNOSTICS,
    clientReadiness: CLEAN_READINESS,
    sourceClassificationCompleteness: CLEAN_SOURCE_COMPLETENESS,
    ...overrides,
  };
}

describe("computeMeasurementHealth", () => {
  it("is healthy when everything is clean: fully comparable, full completion, no failures, full platform coverage, complete metadata, full alias coverage", () => {
    const result = computeMeasurementHealth(baseInputs());
    expect(result.status).toBe("healthy");
    expect(result.completionRate).toBe(1);
    expect(result.failureRate).toBe(0);
    expect(result.platformCoverage).toEqual({ expected: [1, 4], missing: [] });
    expect(result.runId).toBe(5);
  });

  it("is healthy_with_warnings when comparability is comparable_with_warning", () => {
    const result = computeMeasurementHealth(baseInputs({ comparability: comparability("comparable_with_warning") }));
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.reasons.some((r) => r.toLowerCase().includes("comparab"))).toBe(true);
  });

  it("is healthy_with_warnings when a manifest platform is missing from completed responses", () => {
    const result = computeMeasurementHealth(baseInputs({ completedPlatformIds: [1] }));
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.platformCoverage).toEqual({ expected: [1, 4], missing: [4] });
    expect(result.reasons.some((r) => r.includes("4"))).toBe(true);
  });

  it("is healthy_with_warnings when the failure rate is above zero but at or below 20%", () => {
    const run = { ...RUN, completedPrompts: 9, failedPrompts: 1 }; // 10% failure
    const result = computeMeasurementHealth(baseInputs({ run }));
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.failureRate).toBeCloseTo(0.1);
  });

  it("is degraded when the failure rate exceeds 20%, even with an otherwise-clean comparability/platform coverage", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure
    const result = computeMeasurementHealth(baseInputs({ run }));
    expect(result.status).toBe("degraded");
  });

  it("degraded (high failure rate) takes precedence over a mere warning-level comparability result", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure
    const result = computeMeasurementHealth(
      baseInputs({ run, comparability: comparability("comparable_with_warning") })
    );
    expect(result.status).toBe("degraded");
  });

  it("is invalid_for_reporting when comparability is not_comparable, taking precedence over degraded", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure -> would be degraded alone
    const result = computeMeasurementHealth(baseInputs({ run, comparability: comparability("not_comparable") }));
    expect(result.status).toBe("invalid_for_reporting");
  });

  it("is invalid_for_reporting when completion rate is below 50%, taking precedence over everything else", () => {
    const run = { ...RUN, totalPrompts: 10, completedPrompts: 4, failedPrompts: 0 };
    const result = computeMeasurementHealth(baseInputs({ run }));
    expect(result.status).toBe("invalid_for_reporting");
    expect(result.completionRate).toBeCloseTo(0.4);
  });

  it("handles a null comparability (first run, no baseline) gracefully without crashing or forcing a bad status", () => {
    const result = computeMeasurementHealth(baseInputs({ comparability: null }));
    expect(result.status).toBe("healthy");
    expect(result.comparability).toBeNull();
  });

  it("handles a null manifest (no manifest for this run) by skipping platform coverage and comparability entirely", () => {
    const result = computeMeasurementHealth(
      baseInputs({ manifest: null, comparability: null, completedPlatformIds: [] })
    );
    expect(result.status).toBe("healthy");
    expect(result.platformCoverage).toBeNull();
    expect(result.comparability).toBeNull();
  });

  it("always reports replicateCompletion and modelConsistency as not measurable (deferred, issue #30)", () => {
    const result = computeMeasurementHealth(baseInputs());
    expect(result.replicateCompletion).toEqual({ measurable: false });
    expect(result.modelConsistency).toEqual({ measurable: false });
  });

  // issue #30 slice 2: prompt-metadata completeness + brand-alias coverage.
  describe("prompt metadata completeness", () => {
    it("is healthy_with_warnings when any prompt is missing intentType or brandContext classification", () => {
      const diagnostics: CollectionDiagnostics = {
        ...CLEAN_DIAGNOSTICS,
        intentDistribution: { provider_recommendation: 8, unclassified: 2 },
      };
      const result = computeMeasurementHealth(baseInputs({ collectionDiagnostics: diagnostics }));
      expect(result.status).toBe("healthy_with_warnings");
      expect(result.promptMetadataCompleteness).toEqual({ unclassifiedCount: 2, promptCount: 10 });
      expect(result.reasons.some((r) => r.includes("2") && r.toLowerCase().includes("metadata"))).toBe(true);
    });

    it("counts unclassified brandContext prompts too, not just intentType", () => {
      const diagnostics: CollectionDiagnostics = {
        ...CLEAN_DIAGNOSTICS,
        intentDistribution: { provider_recommendation: 10 },
        brandContextDistribution: { unbranded: 9, unclassified: 1 },
      };
      const result = computeMeasurementHealth(baseInputs({ collectionDiagnostics: diagnostics }));
      expect(result.status).toBe("healthy_with_warnings");
      expect(result.promptMetadataCompleteness).toEqual({ unclassifiedCount: 1, promptCount: 10 });
    });

    it("does not warn when collectionDiagnostics has no unclassified prompts", () => {
      const result = computeMeasurementHealth(baseInputs());
      expect(result.promptMetadataCompleteness).toEqual({ unclassifiedCount: 0, promptCount: 10 });
      expect(result.status).toBe("healthy");
    });

    it("skips this input entirely when collectionDiagnostics is null", () => {
      const result = computeMeasurementHealth(baseInputs({ collectionDiagnostics: null }));
      expect(result.promptMetadataCompleteness).toBeNull();
      expect(result.status).toBe("healthy");
    });
  });

  describe("brand-alias coverage", () => {
    it("is healthy_with_warnings when the client has competitor brands but none have aliases configured", () => {
      const readiness: ClientReadiness = {
        ...CLEAN_READINESS,
        competitorBrandCount: 3,
        competitorBrandsWithAliasCount: 0,
        ready: false,
        issues: ["Competitor brands have no aliases configured"],
      };
      const result = computeMeasurementHealth(baseInputs({ clientReadiness: readiness }));
      expect(result.status).toBe("healthy_with_warnings");
      expect(result.reasons.some((r) => r.toLowerCase().includes("alias"))).toBe(true);
    });

    it("does not warn when the client has no competitor brands at all (nothing to have aliases on)", () => {
      const readiness: ClientReadiness = {
        ...CLEAN_READINESS,
        competitorBrandCount: 0,
        competitorBrandsWithAliasCount: 0,
      };
      const result = computeMeasurementHealth(baseInputs({ clientReadiness: readiness }));
      expect(result.status).toBe("healthy");
    });

    it("skips this input entirely when clientReadiness is null", () => {
      const result = computeMeasurementHealth(baseInputs({ clientReadiness: null }));
      expect(result.status).toBe("healthy");
    });
  });

  // issue #30 slice 3: source-classification completeness.
  describe("source classification completeness", () => {
    it("is healthy_with_warnings when any citation is unknown_or_low_trust", () => {
      const result = computeMeasurementHealth(
        baseInputs({ sourceClassificationCompleteness: { citationCount: 10, unclassifiedCount: 3 } })
      );
      expect(result.status).toBe("healthy_with_warnings");
      expect(result.sourceClassificationCompleteness).toEqual({ citationCount: 10, unclassifiedCount: 3 });
      expect(result.reasons.some((r) => r.includes("3") && r.toLowerCase().includes("source"))).toBe(true);
    });

    it("does not warn when there are no unclassified citations", () => {
      const result = computeMeasurementHealth(
        baseInputs({ sourceClassificationCompleteness: { citationCount: 10, unclassifiedCount: 0 } })
      );
      expect(result.status).toBe("healthy");
    });

    it("skips this input entirely when sourceClassificationCompleteness is null", () => {
      const result = computeMeasurementHealth(baseInputs({ sourceClassificationCompleteness: null }));
      expect(result.sourceClassificationCompleteness).toBeNull();
      expect(result.status).toBe("healthy");
    });
  });
});
