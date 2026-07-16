/*
 * Module/Script Name: manifest.test.ts
 * Path: tests/server/services/manifest.test.ts
 *
 * Description:
 * Tests for the measurement run manifest service (issue #3 Epic 2,
 * slice E2a): deterministic config hashing and manifest assembly.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 E2a initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  computeConfigHash,
  assembleManifest,
  type ManifestConfigInput,
} from "../../../server/services/manifest";

const BASE: ManifestConfigInput = {
  methodologyVersion: "1.0",
  panelVersion: "3",
  scoringVersion: "1.0",
  parserVersion: "1.0",
  classifierVersion: "rules-1.0",
  platformIds: [2, 1],
  prompts: [
    { id: 2, text: "Prompt B", intentType: "comparison", brandInPrompt: true, geo: null, service: null },
    { id: 1, text: "Prompt A", intentType: "provider_recommendation", brandInPrompt: false, geo: "Seattle", service: "plumbing" },
  ],
  brands: [
    { id: 11, canonicalName: "Rival", kind: "competitor", primaryDomain: "rival.com", aliases: ["Rival Co"] },
    { id: 10, canonicalName: "Acme", kind: "client", primaryDomain: "acme.com", aliases: ["Acme Inc", "Acme Plumbing"] },
  ],
};

describe("computeConfigHash", () => {
  it("is deterministic for identical input", () => {
    expect(computeConfigHash(BASE)).toBe(computeConfigHash({ ...BASE }));
  });

  it("is independent of array ordering (prompts, brands, platforms, aliases)", () => {
    const reordered: ManifestConfigInput = {
      ...BASE,
      platformIds: [1, 2],
      prompts: [BASE.prompts[1], BASE.prompts[0]],
      brands: [
        { ...BASE.brands[1], aliases: ["Acme Plumbing", "Acme Inc"] },
        BASE.brands[0],
      ],
    };
    expect(computeConfigHash(reordered)).toBe(computeConfigHash(BASE));
  });

  it("changes when a prompt text changes", () => {
    const changed = {
      ...BASE,
      prompts: [BASE.prompts[0], { ...BASE.prompts[1], text: "Prompt A v2" }],
    };
    expect(computeConfigHash(changed)).not.toBe(computeConfigHash(BASE));
  });

  it("changes when a brand alias is added", () => {
    const changed = {
      ...BASE,
      brands: [BASE.brands[0], { ...BASE.brands[1], aliases: [...BASE.brands[1].aliases, "ACME"] }],
    };
    expect(computeConfigHash(changed)).not.toBe(computeConfigHash(BASE));
  });

  it("changes when the methodology version changes", () => {
    expect(computeConfigHash({ ...BASE, methodologyVersion: "2.0" })).not.toBe(computeConfigHash(BASE));
  });
});

describe("assembleManifest", () => {
  it("produces an immutable manifest input with hash, snapshot, and counts", () => {
    const manifest = assembleManifest({
      runId: 99,
      clientId: 10,
      collectionId: 5,
      purpose: "sentinel",
      expectedResponseCount: 8,
      replicateCount: 1,
      config: BASE,
    });

    expect(manifest.runId).toBe(99);
    expect(manifest.purpose).toBe("sentinel");
    expect(manifest.promptCount).toBe(2);
    expect(manifest.expectedResponseCount).toBe(8);
    expect(manifest.methodologyVersion).toBe("1.0");
    expect(manifest.panelVersion).toBe("3");
    expect(manifest.configHash).toBe(computeConfigHash(BASE));
    const snapshot = JSON.parse(manifest.configSnapshot);
    expect(snapshot.prompts.map((p: { id: number }) => p.id)).toEqual([1, 2]); // sorted
    expect(snapshot.brands.map((b: { id: number }) => b.id)).toEqual([10, 11]);
  });
});
