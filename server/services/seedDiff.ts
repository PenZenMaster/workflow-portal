/*
 * Module/Script Name: seedDiff.ts
 * Path: server/services/seedDiff.ts
 *
 * Description:
 * TD-12: compares server/seed.ts's SEED array (the intended source of
 * truth for the workflows table) against the live workflows table, since
 * seedIfEmpty() only ever seeds a completely empty table - every catalog
 * change made directly in prod via the admin UI since then silently
 * drifts seed.ts out of sync (recurred twice: v1.80.1, v1.82.0, each
 * resolved by hand-rolling a one-off reconciliation script). This module
 * is the reusable replacement for those one-off scripts: a pure diff
 * function plus two "apply" generators (seed -> db SQL, db -> seed TS
 * array literal), both left for a human to review before use - neither
 * ever writes to a live database directly.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 TD-12
 */

import type { SeedRow } from "../seed";
import type { Workflow } from "@shared/schema";

export interface FieldDiff {
  field: string;
  seedValue: unknown;
  dbValue: unknown;
}

export interface WorkflowDiffEntry {
  name: string;
  fields: FieldDiff[];
}

export interface SeedDiffResult {
  onlyInSeed: string[];
  onlyInDb: string[];
  differing: WorkflowDiffEntry[];
}

// Every content field seedIfEmpty() actually writes - id/createdAt/
// updatedAt are metadata, not content, and are deliberately excluded.
const COMPARED_FIELDS = [
  "category",
  "description",
  "inputs",
  "optionalInputs",
  "tags",
  "prompt",
  "launchUrl",
  "launchLabel",
  "pinned",
  "acceptsFileUpload",
  "aiAdapterSlug",
  "rankrocketMcpEnabled",
] as const;

type ComparedField = (typeof COMPARED_FIELDS)[number];

// Normalizes a SeedRow (whose optional fields are frequently just
// omitted, e.g. `acceptsFileUpload` absent means false) against a
// Workflow row (whose columns are always present) onto the same
// defaults seedIfEmpty() itself applies on insert - without this, every
// SEED entry that omits an optional field would show as a false-positive
// diff against the db's explicit default value.
function normalize(row: SeedRow | Workflow): Record<ComparedField, unknown> {
  return {
    category: row.category,
    description: row.description,
    inputs: row.inputs ?? [],
    optionalInputs: row.optionalInputs ?? [],
    tags: row.tags,
    prompt: row.prompt,
    launchUrl: row.launchUrl,
    launchLabel: row.launchLabel,
    pinned: !!row.pinned,
    acceptsFileUpload: !!row.acceptsFileUpload,
    aiAdapterSlug: row.aiAdapterSlug ?? null,
    rankrocketMcpEnabled: !!row.rankrocketMcpEnabled,
  };
}

export function diffSeedAgainstDb(seedRows: SeedRow[], dbRows: Workflow[]): SeedDiffResult {
  const seedByName = new Map(seedRows.map((r) => [r.name, r]));
  const dbByName = new Map(dbRows.map((r) => [r.name, r]));

  const onlyInSeed = seedRows.filter((r) => !dbByName.has(r.name)).map((r) => r.name);
  const onlyInDb = dbRows.filter((r) => !seedByName.has(r.name)).map((r) => r.name);

  const differing: WorkflowDiffEntry[] = [];
  for (const seedRow of seedRows) {
    const dbRow = dbByName.get(seedRow.name);
    if (!dbRow) continue;
    const seedNorm = normalize(seedRow);
    const dbNorm = normalize(dbRow);
    const fields: FieldDiff[] = [];
    for (const field of COMPARED_FIELDS) {
      if (JSON.stringify(seedNorm[field]) !== JSON.stringify(dbNorm[field])) {
        fields.push({ field, seedValue: seedNorm[field], dbValue: dbNorm[field] });
      }
    }
    if (fields.length > 0) differing.push({ name: seedRow.name, fields });
  }

  return { onlyInSeed, onlyInDb, differing };
}

function sqlString(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

// Direction: seed.ts -> db. Only ever INSERTs a card missing from the db
// and UPDATEs the specific fields that differ on a matched card - never
// DELETEs, since a card that exists only in the db might just mean
// seed.ts hasn't caught up yet, not that the card should be removed.
// Output is a plain .sql file for a human to review before running it
// against a copy of the target db (or over SSH against prod, same
// technique as every prior direct-SQL prod fix in this repo).
export function generateSyncSql(diff: SeedDiffResult, seedRows: SeedRow[]): string {
  const seedByName = new Map(seedRows.map((r) => [r.name, r]));
  const lines: string[] = [];

  for (const name of diff.onlyInSeed) {
    const row = seedByName.get(name);
    if (!row) continue;
    const now = Date.now();
    lines.push(
      `INSERT INTO workflows (name, category, description, inputs, optional_inputs, tags, prompt, launch_url, launch_label, pinned, accepts_file_upload, ai_adapter_slug, rankrocket_mcp_enabled, created_at, updated_at) VALUES (${sqlString(row.name)}, ${sqlString(row.category)}, ${sqlString(row.description)}, ${sqlString(row.inputs)}, ${sqlString(row.optionalInputs ?? [])}, ${sqlString(row.tags)}, ${sqlString(row.prompt)}, ${sqlString(row.launchUrl)}, ${sqlString(row.launchLabel)}, ${sqlString(!!row.pinned)}, ${sqlString(!!row.acceptsFileUpload)}, ${sqlString(row.aiAdapterSlug ?? null)}, ${sqlString(!!row.rankrocketMcpEnabled)}, ${now}, ${now});`
    );
  }

  const COLUMN_NAMES: Record<ComparedField, string> = {
    category: "category",
    description: "description",
    inputs: "inputs",
    optionalInputs: "optional_inputs",
    tags: "tags",
    prompt: "prompt",
    launchUrl: "launch_url",
    launchLabel: "launch_label",
    pinned: "pinned",
    acceptsFileUpload: "accepts_file_upload",
    aiAdapterSlug: "ai_adapter_slug",
    rankrocketMcpEnabled: "rankrocket_mcp_enabled",
  };

  for (const entry of diff.differing) {
    const sets = entry.fields
      .map((f) => `${COLUMN_NAMES[f.field as ComparedField]} = ${sqlString(f.seedValue)}`)
      .join(", ");
    lines.push(`UPDATE workflows SET ${sets}, updated_at = ${Date.now()} WHERE name = ${sqlString(entry.name)};`);
  }

  return lines.join("\n");
}

// Direction: db -> seed.ts. Regenerates a full `SeedRow[]` TS array
// literal from the db's current rows, for a human to paste over the
// existing SEED array in server/seed.ts and review via the normal
// `git diff` before committing - this function never touches seed.ts
// itself.
export function generateSeedArrayLiteral(dbRows: Workflow[]): string {
  const entries = dbRows.map((row) => {
    const fields = [
      `name: ${JSON.stringify(row.name)}`,
      `category: ${JSON.stringify(row.category)}`,
      `description: ${JSON.stringify(row.description)}`,
      `inputs: ${JSON.stringify(row.inputs)}`,
      ...(row.optionalInputs.length > 0 ? [`optionalInputs: ${JSON.stringify(row.optionalInputs)}`] : []),
      `tags: ${JSON.stringify(row.tags)}`,
      `prompt: ${JSON.stringify(row.prompt)}`,
      `launchUrl: ${JSON.stringify(row.launchUrl)}`,
      `launchLabel: ${JSON.stringify(row.launchLabel)}`,
      `pinned: ${row.pinned}`,
      ...(row.acceptsFileUpload ? [`acceptsFileUpload: ${row.acceptsFileUpload}`] : []),
      ...(row.aiAdapterSlug !== null ? [`aiAdapterSlug: ${JSON.stringify(row.aiAdapterSlug)}`] : []),
      ...(row.rankrocketMcpEnabled ? [`rankrocketMcpEnabled: ${row.rankrocketMcpEnabled}`] : []),
    ];
    return `  {\n    ${fields.join(",\n    ")},\n  }`;
  });
  return `[\n${entries.join(",\n")},\n]`;
}
