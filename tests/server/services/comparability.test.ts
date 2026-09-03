/*
 * Module/Script Name: comparability.test.ts
 * Path: tests/server/services/comparability.test.ts
 *
 * Description:
 * Tests for the run comparability service (issue #3 Epic 2 slice E2b):
 * comparing two immutable run manifests and classifying the differences
 * as fully_comparable / comparable_with_warning / not_comparable with
 * itemized reasons. Severity map locked 2026-07-16: methodology, prompt
 * set/text, platform set, and replicate count are blocking; parser/
 * scoring/classifier/panel versions, brand set, alias, and prompt
 * metadata changes are warnings.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-16
 * Last Modified Date: 2026-07-16
 * Comments:
 * - v1.00 E2b initial implementation
 */

import { describe, it, expect } from "vitest";
import type { MeasurementRunManifest } from "@shared/schema";
import {
  computeConfigHash,
  type ManifestConfigInput,
} from "../../../server/services/manifest";
import { compareManifests } from "../../../server/services/comparability";

const BASE_CONFIG: ManifestConfigInput = {
  methodologyVersion: "1.0",
  panelVersion: "3",
  scoringVersion: "1.0",
  parserVersion: "1.0",
  classifierVersion: "rules-1.0",
  platformIds: [1, 2],
  prompts: [
    { id: 1, text: "Prompt A", intentType: "provider_recommendation", brandInPrompt: false, geo: "Seattle", service: "plumbing" },
    { id: 2, text: "Prompt B", intentType: "comparison", brandInPrompt: true, geo: null, service: null },
  ],
  brands: [
    { id: 10, canonicalName: "Acme", kind: "client", primaryDomain: "acme.com", aliases: ["Acme Inc"] },
    { id: 11, canonicalName: "Rival", kind: "competitor", primaryDomain: "rival.com", aliases: [] },
  ],
};

let nextId = 1;

function makeManifest(
  config: ManifestConfigInput = BASE_CONFIG,
  overrides: Partial<MeasurementRunManifest> = {}
): MeasurementRunManifest {
  const id = nextId++;
  return {
    id,
    runId: overrides.runId ?? id,
    clientId: 10,
    collectionId: 5,
    purpose: "full_panel",
    methodologyVersion: config.methodologyVersion,
    panelVersion: config.panelVersion,
    scoringVersion: config.scoringVersion,
    parserVersion: config.parserVersion,
    classifierVersion: config.classifierVersion,
    platformIds: [...config.platformIds].sort((a, b) => a - b),
    promptCount: config.prompts.length,
    replicateCount: 1,
    expectedResponseCount: config.prompts.length * config.platformIds.length,
    configSnapshot: JSON.stringify({
      methodologyVersion: config.methodologyVersion,
      panelVersion: config.panelVersion,
      scoringVersion: config.scoringVersion,
      parserVersion: config.parserVersion,
      classifierVersion: config.classifierVersion,
      platformIds: [...config.platformIds].sort((a, b) => a - b),
      prompts: [...config.prompts].sort((a, b) => a.id - b.id),
      brands: [...config.brands]
        .sort((a, b) => a.id - b.id)
        .map((b) => ({ ...b, aliases: [...b.aliases].sort() })),
    }),
    configHash: computeConfigHash(config),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("compareManifests — fully comparable", () => {
  it("returns fully_comparable with no reasons for identical configs", () => {
    const base = makeManifest();
    const current = makeManifest();
    const result = compareManifests(base, current);
    expect(result.status).toBe("fully_comparable");
    expect(result.reasons).toEqual([]);
    expect(result.baseRunId).toBe(base.runId);
    expect(result.currentRunId).toBe(current.runId);
  });
});

describe("compareManifests — blocking differences (not_comparable)", () => {
  it("flags a methodology version change as blocking", () => {
    const base = makeManifest();
    const current = makeManifest({ ...BASE_CONFIG, methodologyVersion: "2.0" });
    const result = compareManifests(base, current);
    expect(result.status).toBe("not_comparable");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "methodology_changed", severity: "blocking" })
    );
  });

  it("flags a prompt text change as blocking", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      prompts: [BASE_CONFIG.prompts[0], { ...BASE_CONFIG.prompts[1], text: "Prompt B reworded" }],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("not_comparable");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "prompts_changed", severity: "blocking" })
    );
  });

  it("flags added and removed prompts as blocking with counts in the detail", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      prompts: [
        BASE_CONFIG.prompts[0],
        { id: 3, text: "Prompt C", intentType: null, brandInPrompt: null, geo: null, service: null },
      ],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("not_comparable");
    const reason = result.reasons.find((r) => r.code === "prompts_changed");
    expect(reason?.severity).toBe("blocking");
    expect(reason?.detail).toContain("1 added");
    expect(reason?.detail).toContain("1 removed");
  });

  it("flags a platform set change as blocking", () => {
    const current = makeManifest({ ...BASE_CONFIG, platformIds: [1, 3] });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("not_comparable");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "platforms_changed", severity: "blocking" })
    );
  });

  it("renders platform names instead of raw ids in the detail when a name map is given", () => {
    const current = makeManifest({ ...BASE_CONFIG, platformIds: [1, 3] });
    const platformNames = new Map([
      [1, "Perplexity"],
      [2, "ChatGPT (OpenAI)"],
      [3, "Claude (Anthropic)"],
    ]);
    const result = compareManifests(makeManifest(), current, platformNames);
    const reason = result.reasons.find((r) => r.code === "platforms_changed");
    expect(reason?.detail).toBe("platforms [Perplexity, ChatGPT (OpenAI)] -> [Perplexity, Claude (Anthropic)]");
  });

  it("falls back to #id for a platform missing from the name map", () => {
    const current = makeManifest({ ...BASE_CONFIG, platformIds: [1, 3] });
    const platformNames = new Map([[1, "Perplexity"]]);
    const result = compareManifests(makeManifest(), current, platformNames);
    const reason = result.reasons.find((r) => r.code === "platforms_changed");
    expect(reason?.detail).toBe("platforms [Perplexity, #2] -> [Perplexity, #3]");
  });

  it("flags a replicate count change as blocking", () => {
    const current = makeManifest(BASE_CONFIG, { replicateCount: 3 });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("not_comparable");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "replicates_changed", severity: "blocking" })
    );
  });
});

describe("compareManifests — warning differences (comparable_with_warning)", () => {
  it("flags a parser version change as a warning (the 1.0 -> 1.1 comparability event)", () => {
    const current = makeManifest({ ...BASE_CONFIG, parserVersion: "1.1" });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    const reason = result.reasons.find((r) => r.code === "parser_changed");
    expect(reason?.severity).toBe("warning");
    expect(reason?.detail).toContain("1.0");
    expect(reason?.detail).toContain("1.1");
  });

  it("flags scoring and classifier version changes as warnings", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      scoringVersion: "1.1",
      classifierVersion: "rules-2.0",
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "scoring_changed", severity: "warning" })
    );
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "classifier_changed", severity: "warning" })
    );
  });

  it("flags a panel version change as a warning", () => {
    const current = makeManifest({ ...BASE_CONFIG, panelVersion: "4" });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "panel_version_changed", severity: "warning" })
    );
  });

  it("flags brand set changes (competitor added) as a warning", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      brands: [
        ...BASE_CONFIG.brands,
        { id: 12, canonicalName: "Newcomer", kind: "competitor", primaryDomain: null, aliases: [] },
      ],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    const reason = result.reasons.find((r) => r.code === "brands_changed");
    expect(reason?.severity).toBe("warning");
    expect(reason?.detail).toContain("1 added");
  });

  it("flags alias changes as a warning", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      brands: [
        { ...BASE_CONFIG.brands[0], aliases: ["Acme Inc", "ACME Plumbing"] },
        BASE_CONFIG.brands[1],
      ],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "aliases_changed", severity: "warning" })
    );
  });

  it("flags prompt metadata-only changes as a warning, not blocking", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      prompts: [
        { ...BASE_CONFIG.prompts[0], intentType: "geographic_discovery" },
        BASE_CONFIG.prompts[1],
      ],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("comparable_with_warning");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "prompt_metadata_changed", severity: "warning" })
    );
    expect(result.reasons.find((r) => r.code === "prompts_changed")).toBeUndefined();
  });
});

describe("compareManifests — mixed differences", () => {
  it("reports not_comparable and lists both blocking and warning reasons", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      parserVersion: "1.1",
      platformIds: [1],
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.status).toBe("not_comparable");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "platforms_changed", severity: "blocking" })
    );
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "parser_changed", severity: "warning" })
    );
  });

  it("orders blocking reasons before warnings", () => {
    const current = makeManifest({
      ...BASE_CONFIG,
      parserVersion: "1.1",
      methodologyVersion: "2.0",
    });
    const result = compareManifests(makeManifest(), current);
    expect(result.reasons[0].severity).toBe("blocking");
  });
});
