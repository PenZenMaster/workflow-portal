/**
 * Module/Script Name: seedLaunchTargets.test.ts
 * Path: tests/server/seedLaunchTargets.test.ts
 *
 * Description:
 * Guards the provider choice for workflow card launch targets: no seeded
 * card may launch into Perplexity. Perplexity Computer launches were
 * billed as per-run credit top-ups (three $27 purchases per SEO audit), so
 * card launches go to Claude instead.
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
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi } from "vitest";

// seed.ts imports the live db handle; SEED itself is plain data.
vi.mock("../../server/storage", () => ({ db: {} }));

import { SEED } from "../../server/seed";
import { isPerplexityHost } from "../../client/src/lib/launchUtils";

describe("SEED workflow launch targets", () => {
  it("has no card launching into Perplexity", () => {
    const offenders = SEED.filter((row) => isPerplexityHost(row.launchUrl)).map(
      (row) => row.name
    );
    expect(offenders).toEqual([]);
  });

  it("has no launch label naming Perplexity", () => {
    const offenders = SEED.filter((row) =>
      /perplexity/i.test(row.launchLabel)
    ).map((row) => row.name);
    expect(offenders).toEqual([]);
  });

  it("points the former Perplexity cards at a new Claude chat", () => {
    const names = [
      "SEO Audit via Rank Rocket SEO Plugin",
      "Re-audit existing client site",
      "Location Page Builder (Rank Rocket + WordPress)",
      "Ranking Audit and Improvement Suite",
    ];
    for (const name of names) {
      const row = SEED.find((r) => r.name === name);
      expect(row, name).toBeDefined();
      expect(row?.launchUrl, name).toBe("https://claude.ai/new");
    }
  });
});
