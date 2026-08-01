import { describe, it, expect } from "vitest";
import { computeMeasurementHealth } from "../../../server/services/measurementHealth";
import type { PromptRun, MeasurementRunManifest, ComparabilityResult } from "@shared/schema";

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

function comparability(status: ComparabilityResult["status"]): ComparabilityResult {
  return { status, baseRunId: 3, currentRunId: 5, reasons: [] };
}

describe("computeMeasurementHealth", () => {
  it("is healthy when everything is clean: fully comparable, full completion, no failures, full platform coverage", () => {
    const result = computeMeasurementHealth(RUN, MANIFEST, comparability("fully_comparable"), [1, 4]);
    expect(result.status).toBe("healthy");
    expect(result.completionRate).toBe(1);
    expect(result.failureRate).toBe(0);
    expect(result.platformCoverage).toEqual({ expected: [1, 4], missing: [] });
    expect(result.runId).toBe(5);
  });

  it("is healthy_with_warnings when comparability is comparable_with_warning", () => {
    const result = computeMeasurementHealth(RUN, MANIFEST, comparability("comparable_with_warning"), [1, 4]);
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.reasons.some((r) => r.toLowerCase().includes("comparab"))).toBe(true);
  });

  it("is healthy_with_warnings when a manifest platform is missing from completed responses", () => {
    const result = computeMeasurementHealth(RUN, MANIFEST, comparability("fully_comparable"), [1]);
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.platformCoverage).toEqual({ expected: [1, 4], missing: [4] });
    expect(result.reasons.some((r) => r.includes("4"))).toBe(true);
  });

  it("is healthy_with_warnings when the failure rate is above zero but at or below 20%", () => {
    const run = { ...RUN, completedPrompts: 9, failedPrompts: 1 }; // 10% failure
    const result = computeMeasurementHealth(run, MANIFEST, comparability("fully_comparable"), [1, 4]);
    expect(result.status).toBe("healthy_with_warnings");
    expect(result.failureRate).toBeCloseTo(0.1);
  });

  it("is degraded when the failure rate exceeds 20%, even with an otherwise-clean comparability/platform coverage", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure
    const result = computeMeasurementHealth(run, MANIFEST, comparability("fully_comparable"), [1, 4]);
    expect(result.status).toBe("degraded");
  });

  it("degraded (high failure rate) takes precedence over a mere warning-level comparability result", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure
    const result = computeMeasurementHealth(run, MANIFEST, comparability("comparable_with_warning"), [1, 4]);
    expect(result.status).toBe("degraded");
  });

  it("is invalid_for_reporting when comparability is not_comparable, taking precedence over degraded", () => {
    const run = { ...RUN, completedPrompts: 7, failedPrompts: 3 }; // 30% failure -> would be degraded alone
    const result = computeMeasurementHealth(run, MANIFEST, comparability("not_comparable"), [1, 4]);
    expect(result.status).toBe("invalid_for_reporting");
  });

  it("is invalid_for_reporting when completion rate is below 50%, taking precedence over everything else", () => {
    const run = { ...RUN, totalPrompts: 10, completedPrompts: 4, failedPrompts: 0 };
    const result = computeMeasurementHealth(run, MANIFEST, comparability("fully_comparable"), [1, 4]);
    expect(result.status).toBe("invalid_for_reporting");
    expect(result.completionRate).toBeCloseTo(0.4);
  });

  it("handles a null comparability (first run, no baseline) gracefully without crashing or forcing a bad status", () => {
    const result = computeMeasurementHealth(RUN, MANIFEST, null, [1, 4]);
    expect(result.status).toBe("healthy");
    expect(result.comparability).toBeNull();
  });

  it("handles a null manifest (no manifest for this run) by skipping platform coverage and comparability entirely", () => {
    const result = computeMeasurementHealth(RUN, null, null, []);
    expect(result.status).toBe("healthy");
    expect(result.platformCoverage).toBeNull();
    expect(result.comparability).toBeNull();
  });

  it("always reports replicateCompletion and modelConsistency as not measurable (deferred, issue #30)", () => {
    const result = computeMeasurementHealth(RUN, MANIFEST, comparability("fully_comparable"), [1, 4]);
    expect(result.replicateCompletion).toEqual({ measurable: false });
    expect(result.modelConsistency).toEqual({ measurable: false });
  });
});
