/*
 * Module/Script Name: measurementHealth.ts
 * Path: server/services/measurementHealth.ts
 *
 * Description:
 * Measurement health status (issue #3 Epic 3, tracked on issue #30).
 * Rolls up completion rate, provider failure rate, platform coverage,
 * run comparability, prompt-metadata completeness, and brand-alias
 * coverage into a single healthy / healthy_with_warnings / degraded /
 * invalid_for_reporting status. Replicate completion and model
 * consistency are reported as a static not-measurable flag - deferred,
 * see issue #30 for why. Pure function, no DB access - callers assemble
 * the inputs (collectionDiagnostics and clientReadiness both require
 * their own DB calls upstream, same as manifest/comparability).
 *
 * Status derivation locked 2026-08-01 (plan approval), extended
 * 2026-08-01 slice 2:
 *   invalid_for_reporting  comparability not_comparable, OR completion
 *                          rate below 50%
 *   degraded               failure rate above 20%
 *   healthy_with_warnings  comparability comparable_with_warning, OR a
 *                          manifest platform has no completed responses,
 *                          OR failure rate is above 0% but at/below 20%,
 *                          OR any prompt lacks intentType/brandContext
 *                          classification, OR the client has competitor
 *                          brands with zero aliases configured
 *   healthy                none of the above
 * Precedence when multiple apply: invalid_for_reporting > degraded >
 * healthy_with_warnings > healthy. Prompt-metadata completeness and
 * brand-alias coverage are setup/data-quality signals, not measurement
 * failures - they can only ever produce a warning, never degrade or
 * invalidate a run, matching the warn-don't-block precedent used
 * throughout this codebase (issue #4's diagnostics, source
 * classification, etc.).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-01
 * Last Modified Date: 2026-08-01
 * Comments:
 * - v1.00 issue #30 slice 1 initial implementation
 * - v1.01 issue #30 slice 2: prompt-metadata completeness + brand-alias
 *   coverage folded in; refactored from positional args to a single
 *   inputs object now that there are 6 inputs, before later slices add
 *   more
 */

import type {
  PromptRun,
  MeasurementRunManifest,
  ComparabilityResult,
  CollectionDiagnostics,
  ClientReadiness,
} from "@shared/schema";

export const MEASUREMENT_HEALTH_STATUSES = [
  "healthy",
  "healthy_with_warnings",
  "degraded",
  "invalid_for_reporting",
] as const;
export type MeasurementHealthStatus = (typeof MEASUREMENT_HEALTH_STATUSES)[number];

export interface MeasurementHealthInputs {
  run: PromptRun;
  manifest: MeasurementRunManifest | null;
  comparability: ComparabilityResult | null;
  completedPlatformIds: number[];
  collectionDiagnostics: CollectionDiagnostics | null;
  clientReadiness: ClientReadiness | null;
}

export interface MeasurementHealthResult {
  status: MeasurementHealthStatus;
  runId: number;
  completionRate: number;
  failureRate: number;
  platformCoverage: { expected: number[]; missing: number[] } | null;
  comparability: ComparabilityResult | null;
  promptMetadataCompleteness: { unclassifiedCount: number; promptCount: number } | null;
  brandAliasCoverage: { competitorBrandCount: number; competitorBrandsWithAliasCount: number } | null;
  replicateCompletion: { measurable: false };
  modelConsistency: { measurable: false };
  reasons: string[];
}

const INVALID_COMPLETION_THRESHOLD = 0.5;
const DEGRADED_FAILURE_THRESHOLD = 0.2;

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// Counts prompts missing intentType and/or brandContext classification,
// without double-counting a prompt missing both. collectionDiagnostics
// already buckets nulls under "unclassified" per field (see
// collectionDiagnostics.ts) - summing the two "unclassified" buckets
// would overcount a prompt missing both fields, so this takes the max
// of the two counts as a conservative single completeness signal.
function countUnclassifiedPrompts(diagnostics: CollectionDiagnostics): number {
  const unclassifiedIntent = diagnostics.intentDistribution.unclassified ?? 0;
  const unclassifiedBrandContext = diagnostics.brandContextDistribution.unclassified ?? 0;
  return Math.max(unclassifiedIntent, unclassifiedBrandContext);
}

export function computeMeasurementHealth(inputs: MeasurementHealthInputs): MeasurementHealthResult {
  const { run, manifest, comparability, completedPlatformIds, collectionDiagnostics, clientReadiness } = inputs;

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

  const promptMetadataCompleteness = collectionDiagnostics
    ? {
        unclassifiedCount: countUnclassifiedPrompts(collectionDiagnostics),
        promptCount: collectionDiagnostics.promptCount,
      }
    : null;

  const brandAliasCoverage = clientReadiness
    ? {
        competitorBrandCount: clientReadiness.competitorBrandCount,
        competitorBrandsWithAliasCount: clientReadiness.competitorBrandsWithAliasCount,
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
  const warningByMetadataCompleteness = (promptMetadataCompleteness?.unclassifiedCount ?? 0) > 0;
  const warningByAliasCoverage =
    !!brandAliasCoverage &&
    brandAliasCoverage.competitorBrandCount > 0 &&
    brandAliasCoverage.competitorBrandsWithAliasCount === 0;

  if (warningByComparability) {
    reasons.push("comparable to baseline run with non-blocking warnings");
  }
  if (warningByPlatformCoverage) {
    reasons.push(`missing completed responses from platform(s): ${platformCoverage!.missing.join(", ")}`);
  }
  if (warningByFailure) {
    reasons.push(`provider failure rate ${pct(failureRate)}`);
  }
  if (warningByMetadataCompleteness) {
    reasons.push(
      `${promptMetadataCompleteness!.unclassifiedCount} of ${promptMetadataCompleteness!.promptCount} prompt(s) missing intent/brand-context metadata`
    );
  }
  if (warningByAliasCoverage) {
    reasons.push("competitor brands have no aliases configured");
  }

  const status: MeasurementHealthStatus =
    invalidByComparability || invalidByCompletion
      ? "invalid_for_reporting"
      : degradedByFailure
        ? "degraded"
        : warningByComparability ||
            warningByPlatformCoverage ||
            warningByFailure ||
            warningByMetadataCompleteness ||
            warningByAliasCoverage
          ? "healthy_with_warnings"
          : "healthy";

  return {
    status,
    runId: run.id,
    completionRate,
    failureRate,
    platformCoverage,
    comparability,
    promptMetadataCompleteness,
    brandAliasCoverage,
    replicateCompletion: { measurable: false },
    modelConsistency: { measurable: false },
    reasons,
  };
}
