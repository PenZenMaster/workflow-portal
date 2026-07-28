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
 */

import { describe, it, expect } from "vitest";
import { resolvePanelTypeQuotas, PANEL_TYPE_QUOTAS } from "../../../server/services/panelTypeQuotas";
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
