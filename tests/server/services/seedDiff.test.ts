/*
 * Module/Script Name: seedDiff.test.ts
 * Path: tests/server/services/seedDiff.test.ts
 *
 * Description:
 * Tests for the TD-12 seed<->DB diff/sync tool: diffSeedAgainstDb (pure
 * comparison), generateSyncSql (seed -> db apply), and
 * generateSeedArrayLiteral (db -> seed apply).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 TD-12
 */

import { describe, it, expect } from "vitest";
import {
  diffSeedAgainstDb,
  generateSyncSql,
  generateSeedArrayLiteral,
} from "../../../server/services/seedDiff";
import type { SeedRow } from "../../../server/seed";
import type { Workflow } from "@shared/schema";

function seedRow(overrides: Partial<SeedRow> = {}): SeedRow {
  return {
    name: "Sample Card",
    category: "Audit",
    description: "desc",
    inputs: ["Website URL"],
    tags: ["seo"],
    prompt: "Do the thing: <PASTE>",
    launchUrl: "https://example.com",
    launchLabel: "Launch",
    pinned: false,
    ...overrides,
  };
}

function dbRow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 1,
    name: "Sample Card",
    category: "Audit",
    description: "desc",
    inputs: ["Website URL"],
    optionalInputs: [],
    tags: ["seo"],
    prompt: "Do the thing: <PASTE>",
    launchUrl: "https://example.com",
    launchLabel: "Launch",
    pinned: false,
    acceptsFileUpload: false,
    aiAdapterSlug: null,
    rankrocketMcpEnabled: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

describe("diffSeedAgainstDb", () => {
  it("reports no differences when seed and db match on every compared field", () => {
    const result = diffSeedAgainstDb([seedRow()], [dbRow()]);
    expect(result).toEqual({ onlyInSeed: [], onlyInDb: [], differing: [] });
  });

  it("does not false-positive on optional-field default mismatches (undefined in seed vs false/null/[] in db)", () => {
    // seedRow() omits optionalInputs/acceptsFileUpload/aiAdapterSlug/
    // rankrocketMcpEnabled entirely, matching how most real SEED entries
    // are written - their absence must normalize to the same defaults
    // seedIfEmpty() itself applies on insert.
    const result = diffSeedAgainstDb([seedRow()], [dbRow()]);
    expect(result.differing).toEqual([]);
  });

  it("lists a card present only in seed.ts", () => {
    const result = diffSeedAgainstDb(
      [seedRow(), seedRow({ name: "New Card" })],
      [dbRow()]
    );
    expect(result.onlyInSeed).toEqual(["New Card"]);
    expect(result.onlyInDb).toEqual([]);
  });

  it("lists a card present only in the live db (added directly via the admin UI)", () => {
    const result = diffSeedAgainstDb(
      [seedRow()],
      [dbRow(), dbRow({ id: 2, name: "Prod-Only Card" })]
    );
    expect(result.onlyInDb).toEqual(["Prod-Only Card"]);
    expect(result.onlyInSeed).toEqual([]);
  });

  it("reports a field-level diff for a name-matched card with different content", () => {
    const result = diffSeedAgainstDb(
      [seedRow({ description: "old desc" })],
      [dbRow({ description: "new desc (edited live in prod)" })]
    );
    expect(result.differing).toEqual([
      {
        name: "Sample Card",
        fields: [
          { field: "description", seedValue: "old desc", dbValue: "new desc (edited live in prod)" },
        ],
      },
    ]);
  });

  it("reports every differing field, not just the first", () => {
    const result = diffSeedAgainstDb(
      [seedRow({ description: "old", pinned: false })],
      [dbRow({ description: "new", pinned: true })]
    );
    expect(result.differing[0].fields.map((f) => f.field).sort()).toEqual(["description", "pinned"]);
  });

  it("compares array fields (inputs/tags) by content, not reference", () => {
    const result = diffSeedAgainstDb(
      [seedRow({ inputs: ["Website URL", "GBP"] })],
      [dbRow({ inputs: ["Website URL", "GBP"] })]
    );
    expect(result.differing).toEqual([]);
  });
});

describe("generateSyncSql", () => {
  it("emits an INSERT for a card that exists only in seed.ts", () => {
    const diff = diffSeedAgainstDb([seedRow({ name: "New Card" })], []);
    const sql = generateSyncSql(diff, [seedRow({ name: "New Card" })]);
    expect(sql).toContain("INSERT INTO workflows");
    expect(sql).toContain("New Card");
  });

  it("emits an UPDATE for only the differing fields of a matched card", () => {
    const seed = [seedRow({ description: "old desc" })];
    const diff = diffSeedAgainstDb(seed, [dbRow({ description: "new desc" })]);
    const sql = generateSyncSql(diff, seed);
    expect(sql).toContain("UPDATE workflows");
    expect(sql).toContain("SET description");
    expect(sql).toContain("WHERE name =");
  });

  it("never emits a DELETE - a db-only card is left untouched, not removed", () => {
    const diff = diffSeedAgainstDb([seedRow()], [dbRow(), dbRow({ id: 2, name: "Prod-Only Card" })]);
    const sql = generateSyncSql(diff, [seedRow()]);
    expect(sql.toUpperCase()).not.toContain("DELETE");
  });

  it("escapes a single quote in a value so the generated SQL is valid", () => {
    const seed = [seedRow({ name: "New Card", description: "Client's audit" })];
    const diff = diffSeedAgainstDb(seed, []);
    const sql = generateSyncSql(diff, seed);
    expect(sql).toContain("Client''s audit");
  });
});

describe("generateSeedArrayLiteral", () => {
  it("produces a valid-looking SeedRow[] TS literal from db rows", () => {
    const literal = generateSeedArrayLiteral([dbRow({ name: "Prod-Only Card" })]);
    expect(literal).toContain("Prod-Only Card");
    expect(literal).toContain("category:");
    expect(literal.trim().startsWith("[")).toBe(true);
    expect(literal.trim().endsWith("]")).toBe(true);
  });

  it("round-trips through JSON.parse-able field values (no unescaped special characters)", () => {
    const literal = generateSeedArrayLiteral([
      dbRow({ name: "Tricky Card", prompt: 'Say "hello" and use a backtick ` here.' }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evaluated = new Function(`return ${literal}`)() as any[];
    expect(evaluated[0].name).toBe("Tricky Card");
    expect(evaluated[0].prompt).toBe('Say "hello" and use a backtick ` here.');
  });
});
