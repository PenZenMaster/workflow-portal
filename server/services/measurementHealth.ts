/*
 * Module/Script Name: measurementHealth.ts
 * Path: server/services/measurementHealth.ts
 *
 * Description:
 * Measurement health status (issue #3 Epic 3 slice 1, tracked on issue
 * #30). Rolls up completion rate, provider failure rate, platform
 * coverage, and run comparability into a single healthy /
 * healthy_with_warnings / degraded / invalid_for_reporting status.
 * Replicate completion and model consistency are reported as a static
 * not-measurable flag - deferred, see issue #30 for why. Pure function,
 * no DB access - callers assemble the inputs.
 *
 * Status derivation locked 2026-08-01 (plan approval):
 *   invalid_for_reporting  comparability not_comparable, OR completion
 *                          rate below 50%
 *   degraded               failure rate above 20%
 *   healthy_with_warnings  comparability comparable_with_warning, OR a
 *                          manifest platform has no completed responses,
 *                          OR failure rate is above 0% but at/below 20%
 *   healthy                none of the above
 * Precedence when multiple apply: invalid_for_reporting > degraded >
 * healthy_with_warnings > healthy.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-01
 * Last Modified Date: 2026-08-01
 * Comments:
 * - v1.00 issue #30 slice 1 initial implementation
 */

import type { PromptRun, MeasurementRunManifest, ComparabilityResult } from "@shared/schema";

export const MEASUREMENT_HEALTH_STATUSES = [
  "healthy",
  "healthy_with_warnings",
  "degraded",
  "invalid_for_reporting",
] as const;
export type MeasurementHealthStatus = (typeof MEASUREMENT_HEALTH_STATUSES)[number];

export interface MeasurementHealthResult {
  status: MeasurementHealthStatus;
  runId: number;
  completionRate: number;
  failureRate: number;
  platformCoverage: { expected: number[]; missing: number[] } | null;
  comparability: ComparabilityResult | null;
  replicateCompletion: { measurable: false };
  modelConsistency: { measurable: false };
  reasons: string[];
}

const INVALID_COMPLETION_THRESHOLD = 0.5;
const DEGRADED_FAILURE_THRESHOLD = 0.2;

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function computeMeasurementHealth(
  run: PromptRun,
  manifest: MeasurementRunManifest | null,
  comparability: ComparabilityResult | null,
  completedPlatformIds: number[]
): MeasurementHealthResult {
  const completionRate = run.totalPrompts > 0 ? run.completedPrompts / run.totalPrompts : 1;
  const failureRate = run.totalPrompts > 0 ? run.failedPrompts / run.totalPrompts : 0;

  const platformCoverage = manifest
    ? {
        expected: [...manifest.platformIds].sort((a, b) => a - b),
        missing: [...manifest.platformIds]
          .filter((id) => !completedPlatformIds.includes(id))
          .sort((a, b) => a - b),
      }
    : null;

  const reasons: string[] = [];

  const invalidByComparability = comparability?.status === "not_comparable";
  const invalidByCompletion = completionRate < INVALID_COMPLETION_THRESHOLD;
  if (invalidByComparability) {
    reasons.push(
      `not comparable to baseline run ${comparability!.baseRunId} (blocking methodology/prompt/platform/replicate changes)`
    );
  }
  if (invalidByCompletion) {
    reasons.push(`completion rate ${pct(completionRate)} is below the ${pct(INVALID_COMPLETION_THRESHOLD)} reporting threshold`);
  }

  const degradedByFailure = failureRate > DEGRADED_FAILURE_THRESHOLD;
  if (degradedByFailure) {
    reasons.push(`provider failure rate ${pct(failureRate)} exceeds ${pct(DEGRADED_FAILURE_THRESHOLD)}`);
  }

  const warningByComparability = comparability?.status === "comparable_with_warning";
  const warningByPlatformCoverage = (platformCoverage?.missing.length ?? 0) > 0;
  const warningByFailure = failureRate > 0 && !degradedByFailure;
  if (warningByComparability) {
    reasons.push("comparable to baseline run with non-blocking warnings");
  }
  if (warningByPlatformCoverage) {
    reasons.push(`missing completed responses from platform(s): ${platformCoverage!.missing.join(", ")}`);
  }
  if (warningByFailure) {
    reasons.push(`provider failure rate ${pct(failureRate)}`);
  }

  const status: MeasurementHealthStatus =
    invalidByComparability || invalidByCompletion
      ? "invalid_for_reporting"
      : degradedByFailure
        ? "degraded"
        : warningByComparability || warningByPlatformCoverage || warningByFailure
          ? "healthy_with_warnings"
          : "healthy";

  return {
    status,
    runId: run.id,
    completionRate,
    failureRate,
    platformCoverage,
    comparability,
    replicateCompletion: { measurable: false },
    modelConsistency: { measurable: false },
    reasons,
  };
}
