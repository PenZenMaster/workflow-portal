/*
 * Module/Script Name: panelTypeQuotas.test.ts
 * Path: tests/server/services/panelTypeQuotas.test.ts
 *
 * Description:
 * Tests for resolvePanelTypeQuotas - the ratio-based per-panel-type
 * quota resolver (issue #4 Phase 3 item 9, slice 1). Ratios are locked
 * with the user 2026-07-28; this suite checks the rounding contract
 * (exact-sum-to-count via largest remainder) rather than re-asserting
 * every literal ratio value.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-28
 * Last Modified Date: 2026-07-28
 * Comments:
 * - v1.00 issue #4 Phase 3 slice 1 initial implementation
 * - v1.01 issue #4 Phase 3 slice 2: computeQuotaShortfall and
 *   violatesBrandConstraint (quota enforcement)
 */

import { describe, it, expect } from "vitest";
import {
  resolvePanelTypeQuotas,
  PANEL_TYPE_QUOTAS,
  computeQuotaShortfall,
  computeQuotaExcess,
  violatesBrandConstraint,
} from "../../../server/services/panelTypeQuotas";
import { PROMPT_PANEL_TYPES } from "../../../shared/schema";

describe("resolvePanelTypeQuotas", () => {
  it.each(PROMPT_PANEL_TYPES)("%s: intent counts always sum exactly to the requested count", (panelType) => {
    for (const count of [1, 12, 30, 50]) {
      const resolved = resolvePanelTypeQuotas(panelType, count);
      const total = Object.values(resolved.intentCounts).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBe(count);
    }
  });

  it.each(PROMPT_PANEL_TYPES)("%s: no intent count is negative", (panelType) => {
    const resolved = resolvePanelTypeQuotas(panelType, 12);
    for (const v of Object.values(resolved.intentCounts)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("balanced_baseline matches today's default 9-intent mix and 80/20 brand constraint", () => {
    const resolved = resolvePanelTypeQuotas("balanced_baseline", 30);
    expect(resolved.brandConstraint).toBe("baseline_mix");
    const total = Object.values(resolved.intentCounts).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(30);
    expect(Object.keys(resolved.intentCounts).length).toBeGreaterThanOrEqual(9);
  });

  it("discovery forbids client/competitor brand presence", () => {
    const resolved = resolvePanelTypeQuotas("discovery", 20);
    expect(resolved.brandConstraint).toBe("unbranded_only");
  });

  it("entity_audit is client-branded only", () => {
    const resolved = resolvePanelTypeQuotas("entity_audit", 15);
    expect(resolved.brandConstraint).toBe("client_branded_only");
  });

  it("competitive is competitor-branded only", () => {
    const resolved = resolvePanelTypeQuotas("competitive", 15);
    expect(resolved.brandConstraint).toBe("competitor_branded_only");
  });

  it("topic_authority is unbranded only and educational-heavy", () => {
    const resolved = resolvePanelTypeQuotas("topic_authority", 20);
    expect(resolved.brandConstraint).toBe("unbranded_only");
    const educational = resolved.intentCounts.educational ?? 0;
    const total = Object.values(resolved.intentCounts).reduce((a, b) => a + (b ?? 0), 0);
    expect(educational / total).toBeGreaterThan(0.5);
  });

  it("local_commercial uses the baseline_mix brand constraint", () => {
    const resolved = resolvePanelTypeQuotas("local_commercial", 20);
    expect(resolved.brandConstraint).toBe("baseline_mix");
  });

  it("every panel type's declared ratios sum to 1 (within rounding tolerance)", () => {
    for (const panelType of PROMPT_PANEL_TYPES) {
      const sum = Object.values(PANEL_TYPE_QUOTAS[panelType].intentRatios).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
  });

  it("count of 0 resolves to all-zero counts without throwing", () => {
    const resolved = resolvePanelTypeQuotas("balanced_baseline", 0);
    const total = Object.values(resolved.intentCounts).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(0);
  });
});

describe("computeQuotaShortfall", () => {
  it("returns an empty object when every intent cell is fully met", () => {
    const resolved = resolvePanelTypeQuotas("entity_audit", 15); // brand_validation 8, trust_validation 4, provider_recommendation 3 (7.5/3.75/3.75 -> largest remainder)
    const candidates = [
      ...Array(resolved.intentCounts.brand_validation ?? 0).fill({ intentType: "brand_validation" }),
      ...Array(resolved.intentCounts.trust_validation ?? 0).fill({ intentType: "trust_validation" }),
      ...Array(resolved.intentCounts.provider_recommendation ?? 0).fill({ intentType: "provider_recommendation" }),
    ];
    expect(computeQuotaShortfall(resolved, candidates)).toEqual({});
  });

  it("reports a positive shortfall for an under-represented intent and omits satisfied ones", () => {
    const resolved = resolvePanelTypeQuotas("entity_audit", 15);
    const candidates = [
      ...Array(resolved.intentCounts.brand_validation ?? 0).fill({ intentType: "brand_validation" }),
      // trust_validation and provider_recommendation entirely missing
    ];
    const shortfall = computeQuotaShortfall(resolved, candidates);
    expect(shortfall.brand_validation).toBeUndefined();
    expect(shortfall.trust_validation).toBe(resolved.intentCounts.trust_validation);
    expect(shortfall.provider_recommendation).toBe(resolved.intentCounts.provider_recommendation);
  });

  it("never reports a negative shortfall when an intent is over-represented", () => {
    const resolved = resolvePanelTypeQuotas("competitive", 15);
    const candidates = Array(30).fill({ intentType: "comparison" });
    const shortfall = computeQuotaShortfall(resolved, candidates);
    expect(shortfall.comparison).toBeUndefined();
  });
});

// issue #4 Phase 3 item J follow-up: the shortfall banner's mirror image
// - which intents are over-represented, so the UI can suggest a
// reclassify instead of always telling the user to add new content.
describe("computeQuotaExcess", () => {
  it("returns an empty object when every intent cell exactly matches its quota", () => {
    const resolved = resolvePanelTypeQuotas("entity_audit", 15);
    const candidates = [
      ...Array(resolved.intentCounts.brand_validation ?? 0).fill({ intentType: "brand_validation" }),
      ...Array(resolved.intentCounts.trust_validation ?? 0).fill({ intentType: "trust_validation" }),
      ...Array(resolved.intentCounts.provider_recommendation ?? 0).fill({ intentType: "provider_recommendation" }),
    ];
    expect(computeQuotaExcess(resolved, candidates)).toEqual({});
  });

  it("reports a positive excess for an over-represented intent and omits satisfied/under ones", () => {
    const resolved = resolvePanelTypeQuotas("competitive", 15);
    const candidates = Array(30).fill({ intentType: "comparison" });
    const excess = computeQuotaExcess(resolved, candidates);
    expect(excess.comparison).toBe(30 - (resolved.intentCounts.comparison ?? 0));
    expect(excess.alternative).toBeUndefined();
    expect(excess.brand_validation).toBeUndefined();
  });

  it("never reports a negative excess when an intent is under-represented", () => {
    const resolved = resolvePanelTypeQuotas("entity_audit", 15);
    const excess = computeQuotaExcess(resolved, []); // nothing generated yet - all cells under, none over
    expect(excess).toEqual({});
  });

  it("shortfall and excess totals always balance (quotas are a fixed split of the same count)", () => {
    const resolved = resolvePanelTypeQuotas("balanced_baseline", 39);
    const candidates = [
      ...Array(9).fill({ intentType: "provider_recommendation" }),
      ...Array(6).fill({ intentType: "service_specific" }),
      ...Array(5).fill({ intentType: "problem_solution" }),
      ...Array(5).fill({ intentType: "geographic_discovery" }),
      ...Array(5).fill({ intentType: "educational" }),
      ...Array(3).fill({ intentType: "trust_validation" }),
      ...Array(3).fill({ intentType: "comparison" }),
      ...Array(1).fill({ intentType: "brand_validation" }),
      ...Array(2).fill({ intentType: "alternative" }),
    ];
    const shortfall = computeQuotaShortfall(resolved, candidates);
    const excess = computeQuotaExcess(resolved, candidates);
    const shortfallTotal = Object.values(shortfall).reduce((a, b) => a + (b ?? 0), 0);
    const excessTotal = Object.values(excess).reduce((a, b) => a + (b ?? 0), 0);
    expect(shortfallTotal).toBe(excessTotal);
    expect(shortfall).toEqual({ service_specific: 1 });
    expect(excess).toEqual({ alternative: 1 });
  });
});

describe("violatesBrandConstraint", () => {
  it("baseline_mix never violates, regardless of brand context", () => {
    expect(violatesBrandConstraint("client_branded", "baseline_mix")).toBe(false);
    expect(violatesBrandConstraint("unbranded", "baseline_mix")).toBe(false);
  });

  it("unbranded_only violates for any branded context", () => {
    expect(violatesBrandConstraint("unbranded", "unbranded_only")).toBe(false);
    expect(violatesBrandConstraint("client_branded", "unbranded_only")).toBe(true);
    expect(violatesBrandConstraint("competitor_branded", "unbranded_only")).toBe(true);
    expect(violatesBrandConstraint("client_and_competitor", "unbranded_only")).toBe(true);
  });

  it("client_branded_only accepts client_branded and client_and_competitor, rejects the rest", () => {
    expect(violatesBrandConstraint("client_branded", "client_branded_only")).toBe(false);
    expect(violatesBrandConstraint("client_and_competitor", "client_branded_only")).toBe(false);
    expect(violatesBrandConstraint("unbranded", "client_branded_only")).toBe(true);
    expect(violatesBrandConstraint("competitor_branded", "client_branded_only")).toBe(true);
  });

  it("competitor_branded_only accepts competitor_branded and client_and_competitor, rejects the rest", () => {
    expect(violatesBrandConstraint("competitor_branded", "competitor_branded_only")).toBe(false);
    expect(violatesBrandConstraint("client_and_competitor", "competitor_branded_only")).toBe(false);
    expect(violatesBrandConstraint("unbranded", "competitor_branded_only")).toBe(true);
    expect(violatesBrandConstraint("client_branded", "competitor_branded_only")).toBe(true);
  });
});
