/*
 * Module/Script Name: manifest.ts
 * Path: server/services/manifest.ts
 *
 * Description:
 * Measurement run manifest assembly (issue #3 Epic 2 slice E2a). Builds
 * a canonical, order-independent snapshot of everything a run was
 * configured to execute and hashes it deterministically so later runs
 * can be compared for methodology compatibility. Pure functions only —
 * callers fetch the data and persist the result.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 E2a initial implementation
 */

import crypto from "node:crypto";
import type { RunPurpose } from "@shared/schema";

export interface ManifestPromptInput {
  id: number;
  text: string;
  intentType: string | null;
  brandInPrompt: boolean | null;
  geo: string | null;
  service: string | null;
}

export interface ManifestBrandInput {
  id: number;
  canonicalName: string;
  kind: string;
  primaryDomain: string | null;
  aliases: string[];
}

export interface ManifestConfigInput {
  methodologyVersion: string;
  panelVersion: string | null;
  scoringVersion: string;
  parserVersion: string;
  classifierVersion: string;
  platformIds: number[];
  prompts: ManifestPromptInput[];
  brands: ManifestBrandInput[];
}

// Canonical form: fixed key order by construction, arrays sorted so the
// hash is independent of fetch order.
function canonicalize(config: ManifestConfigInput): Record<string, unknown> {
  return {
    methodologyVersion: config.methodologyVersion,
    panelVersion: config.panelVersion,
    scoringVersion: config.scoringVersion,
    parserVersion: config.parserVersion,
    classifierVersion: config.classifierVersion,
    platformIds: [...config.platformIds].sort((a, b) => a - b),
    prompts: [...config.prompts]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        text: p.text,
        intentType: p.intentType,
        brandInPrompt: p.brandInPrompt,
        geo: p.geo,
        service: p.service,
      })),
    brands: [...config.brands]
      .sort((a, b) => a.id - b.id)
      .map((b) => ({
        id: b.id,
        canonicalName: b.canonicalName,
        kind: b.kind,
        primaryDomain: b.primaryDomain,
        aliases: [...b.aliases].sort(),
      })),
  };
}

export function computeConfigHash(config: ManifestConfigInput): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(config)))
    .digest("hex");
}

export interface AssembleManifestInput {
  runId: number;
  clientId: number;
  collectionId: number;
  purpose: RunPurpose;
  expectedResponseCount: number;
  replicateCount: number;
  config: ManifestConfigInput;
}

export interface ManifestCreateInput {
  runId: number;
  clientId: number;
  collectionId: number;
  purpose: RunPurpose;
  methodologyVersion: string;
  panelVersion: string | null;
  scoringVersion: string;
  parserVersion: string;
  classifierVersion: string;
  platformIds: number[];
  promptCount: number;
  replicateCount: number;
  expectedResponseCount: number;
  configSnapshot: string;
  configHash: string;
}

export function assembleManifest(input: AssembleManifestInput): ManifestCreateInput {
  const canonical = canonicalize(input.config);
  return {
    runId: input.runId,
    clientId: input.clientId,
    collectionId: input.collectionId,
    purpose: input.purpose,
    methodologyVersion: input.config.methodologyVersion,
    panelVersion: input.config.panelVersion,
    scoringVersion: input.config.scoringVersion,
    parserVersion: input.config.parserVersion,
    classifierVersion: input.config.classifierVersion,
    platformIds: [...input.config.platformIds].sort((a, b) => a - b),
    promptCount: input.config.prompts.length,
    replicateCount: input.replicateCount,
    expectedResponseCount: input.expectedResponseCount,
    configSnapshot: JSON.stringify(canonical),
    configHash: computeConfigHash(input.config),
  };
}
