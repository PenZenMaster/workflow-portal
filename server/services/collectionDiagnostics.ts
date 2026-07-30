/*
 * Module/Script Name: collectionDiagnostics.ts
 * Path: server/services/collectionDiagnostics.ts
 *
 * Description:
 * Pre-activation methodology summary for a collection's persisted
 * prompts (issue #4 Phase 3 item J, slice 5): intent/brand-context/
 * funnel-stage distributions, geo/service coverage, exact and near-
 * duplicate detection across the whole stored set, and quotaShortfall
 * resolved against the collection's panel type - the only diagnostic
 * that blocks activation (POST /api/prompt-collections/:id/activate).
 * Everything else is informational, same warn-don't-block precedent as
 * the rest of issue #4. Pure function, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-29
 * Last Modified Date: 2026-07-29
 * Comments:
 * - v1.00 issue #4 Phase 3 slice 5 initial implementation
 */

import type { CollectionDiagnostics, Prompt, PromptPanelType } from "@shared/schema";
import { normalizePromptText, isNearDuplicate, jaccardSimilarity } from "./nearDuplicate";
import { resolvePanelTypeQuotas, computeQuotaShortfall } from "./panelTypeQuotas";

export function computeCollectionDiagnostics(prompts: Prompt[], panelType: PromptPanelType): CollectionDiagnostics {
  const intentDistribution: CollectionDiagnostics["intentDistribution"] = {};
  const brandContextDistribution: CollectionDiagnostics["brandContextDistribution"] = {};
  const funnelStageDistribution: CollectionDiagnostics["funnelStageDistribution"] = {};
  const geoSet = new Set<string>();
  const serviceSet = new Set<string>();

  for (const p of prompts) {
    const intentKey = p.intentType ?? "unclassified";
    intentDistribution[intentKey] = (intentDistribution[intentKey] ?? 0) + 1;

    const brandKey = p.brandContext ?? "unclassified";
    brandContextDistribution[brandKey] = (brandContextDistribution[brandKey] ?? 0) + 1;

    funnelStageDistribution[p.funnelStage] = (funnelStageDistribution[p.funnelStage] ?? 0) + 1;

    if (p.geo) geoSet.add(p.geo);
    if (p.service) serviceSet.add(p.service);
  }

  // Exact-duplicate groups: bucket by normalized text, keep only groups
  // with 2+ members (same normalization promptGenerator.ts uses at
  // generation time, applied retroactively across the whole stored set).
  const normalizedGroups = new Map<string, string[]>();
  for (const p of prompts) {
    const key = normalizePromptText(p.text);
    const group = normalizedGroups.get(key);
    if (group) group.push(p.text);
    else normalizedGroups.set(key, [p.text]);
  }
  const duplicateGroups = Array.from(normalizedGroups.values()).filter((g) => g.length > 1);
  const exactDuplicateNormalized = new Set(
    Array.from(normalizedGroups.entries()).filter(([, g]) => g.length > 1).map(([key]) => key)
  );

  // Near-duplicate pairs: every pair not already covered by an exact-
  // duplicate group above (O(n^2) - fine at expected panel sizes).
  const nearDuplicatePairs: CollectionDiagnostics["nearDuplicatePairs"] = [];
  for (let i = 0; i < prompts.length; i++) {
    const normalizedI = normalizePromptText(prompts[i].text);
    if (exactDuplicateNormalized.has(normalizedI)) continue;
    for (let j = i + 1; j < prompts.length; j++) {
      const normalizedJ = normalizePromptText(prompts[j].text);
      if (exactDuplicateNormalized.has(normalizedJ) || normalizedI === normalizedJ) continue;
      if (isNearDuplicate(prompts[i].text, prompts[j].text)) {
        nearDuplicatePairs.push({
          textA: prompts[i].text,
          textB: prompts[j].text,
          similarityPct: Math.round(jaccardSimilarity(prompts[i].text, prompts[j].text) * 100),
        });
      }
    }
  }

  const resolved = resolvePanelTypeQuotas(panelType, prompts.length);
  const classified = prompts.filter((p): p is Prompt & { intentType: NonNullable<Prompt["intentType"]> } => p.intentType != null);
  const quotaShortfall = computeQuotaShortfall(resolved, classified);

  return {
    promptCount: prompts.length,
    intentDistribution,
    brandContextDistribution,
    funnelStageDistribution,
    geoCoverage: Array.from(geoSet),
    serviceCoverage: Array.from(serviceSet),
    duplicateGroups,
    nearDuplicatePairs,
    quotaShortfall,
  };
}
