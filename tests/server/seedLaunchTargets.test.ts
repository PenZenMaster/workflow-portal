/**
 * Module/Script Name: seedLaunchTargets.test.ts
 * Path: tests/server/seedLaunchTargets.test.ts
 *
 * Description:
 * Guards workflow card launch targets and the seo-site-audit skill cards.
 * Perplexity Computer launches were billed as per-run credit top-ups, so
 * cards launch to Claude - except cards that invoke the "seo-site-audit"
 * skill, which lives in Perplexity (v4.0, one task per phase, cost-tuned).
 *
 * Author(s):
 * Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 *
 * Created Date:
 * 2026-09-28
 *
 * Last Modified Date:
 * 2026-09-28
 *
 * Comments:
 * - v1.00 Initial implementation (no Perplexity launch targets)
 * - v1.01 Allow Perplexity for seo-site-audit skill cards; assert the
 *         skill v4.0 per-phase prompts and credential-free inputs
 */

import { describe, it, expect, vi } from "vitest";

// seed.ts imports the live db handle; SEED itself is plain data.
vi.mock("../../server/storage", () => ({ db: {} }));

import { SEED, type SeedRow } from "../../server/seed";
import {
  fillPrompt,
  hasSensitiveInputLabel,
  isPerplexityHost,
} from "../../client/src/lib/launchUtils";

const SKILL_PREFIX = 'Use the "seo-site-audit" skill.';

function card(name: string): SeedRow {
  const row = SEED.find((r) => r.name === name);
  if (!row) throw new Error(`missing seed card: ${name}`);
  return row;
}

function pasteTokens(prompt: string): number {
  return (prompt.match(/<PASTE>/g) ?? []).length;
}

describe("SEED workflow launch targets", () => {
  it("launches into Perplexity only for seo-site-audit skill cards", () => {
    const offenders = SEED.filter(
      (row) => isPerplexityHost(row.launchUrl) && !row.prompt.startsWith(SKILL_PREFIX)
    ).map((row) => row.name);
    expect(offenders).toEqual([]);
  });

  it("has no launch label naming Perplexity", () => {
    const offenders = SEED.filter((row) =>
      /perplexity/i.test(row.launchLabel)
    ).map((row) => row.name);
    expect(offenders).toEqual([]);
  });

  it("keeps the Claude-run cards' manual fallbacks on a new Claude chat", () => {
    for (const name of [
      "Location Page Builder (Rank Rocket + WordPress)",
      "Ranking Audit and Improvement Suite",
    ]) {
      expect(card(name).launchUrl, name).toBe("https://claude.ai/new");
    }
  });

  it("launches the seo-site-audit cards in Perplexity Computer", () => {
    for (const name of [
      "SEO Audit via Rank Rocket SEO Plugin",
      "Re-audit existing client site",
    ]) {
      expect(card(name).launchUrl, name).toBe("https://www.perplexity.ai/computer");
    }
  });
});

describe("seo-site-audit v4.0 skill cards", () => {
  const audit = card("SEO Audit via Rank Rocket SEO Plugin");
  const reaudit = card("Re-audit existing client site");

  it("starts the audit card with the scan-phase task only", () => {
    expect(audit.prompt.startsWith(SKILL_PREFIX)).toBe(true);
    expect(audit.prompt).toContain("seo-site-audit: scan <PASTE>");
    expect(audit.prompt).not.toMatch(/one at a time/i);
  });

  it("maps the re-audit card to the drift-check task", () => {
    expect(reaudit.prompt.startsWith(SKILL_PREFIX)).toBe(true);
    expect(reaudit.prompt).toContain("seo-site-audit: drift check <PASTE>");
  });

  it("has exactly one <PASTE> token per input, in order", () => {
    for (const row of [audit, reaudit]) {
      const inputs = [...row.inputs, ...(row.optionalInputs ?? [])];
      expect(pasteTokens(row.prompt), row.name).toBe(inputs.length);
      const filled = fillPrompt(row.prompt, inputs.map((_, i) => `VALUE${i}`));
      expect(filled, row.name).not.toMatch(/<[A-Z][A-Z /]*>/);
    }
  });

  it("never asks for WordPress credentials (the Perplexity vault holds them)", () => {
    for (const row of [audit, reaudit]) {
      const labels = [...row.inputs, ...(row.optionalInputs ?? [])];
      expect(hasSensitiveInputLabel(labels), row.name).toBe(false);
      expect(labels.some((l) => /wp username/i.test(l)), row.name).toBe(false);
    }
  });
});
