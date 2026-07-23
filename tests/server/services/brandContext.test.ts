/*
 * Module/Script Name: brandContext.test.ts
 * Path: tests/server/services/brandContext.test.ts
 *
 * Description:
 * Deterministic brand-context classifier tests (issue #4 Phase 1 slice 2).
 * Fixtures cover unbranded/client/competitor/mixed presence, canonical-name
 * fallback (no alias rows), case-insensitivity, and regex aliases - mirrors
 * the matching semantics already proven in parser.test.ts so mention
 * detection and brand-context derivation never disagree on the same text.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 2 initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  deriveBrandContext,
  BRAND_CONTEXT_CLASSIFIER_VERSION,
} from "../../../server/services/brandContext";
import type { BrandInput } from "../../../server/services/parser";

function brand(canonicalName: string, aliases: BrandInput["aliases"] = []): BrandInput {
  return { id: 1, canonicalName, primaryDomain: null, aliases };
}

describe("deriveBrandContext (golden dataset)", () => {
  it("exports a classifier version for provenance", () => {
    expect(BRAND_CONTEXT_CLASSIFIER_VERSION).toMatch(/^rules-/);
  });

  it("returns 'unbranded' when neither client nor competitor brand appears", () => {
    const result = deriveBrandContext(
      "Who are the best commercial roofers in Grand Rapids?",
      [brand("Acme Roofing")],
      [brand("Rival Roofing")]
    );
    expect(result).toBe("unbranded");
  });

  it("returns 'client_branded' when only the client brand's canonical name appears", () => {
    const result = deriveBrandContext(
      "Is Acme Roofing a reputable contractor?",
      [brand("Acme Roofing")],
      [brand("Rival Roofing")]
    );
    expect(result).toBe("client_branded");
  });

  it("returns 'client_branded' via a configured alias, not just the canonical name", () => {
    const result = deriveBrandContext(
      "Have you worked with AcmeRoof before?",
      [brand("Acme Roofing", [{ aliasText: "AcmeRoof", matchType: "exact" }])],
      [brand("Rival Roofing")]
    );
    expect(result).toBe("client_branded");
  });

  it("returns 'competitor_branded' when only a competitor brand appears (canonical name, no alias rows)", () => {
    const result = deriveBrandContext(
      "What are some alternatives to Rival Roofing?",
      [brand("Acme Roofing")],
      [brand("Rival Roofing")]
    );
    expect(result).toBe("competitor_branded");
  });

  it("returns 'client_and_competitor' when both appear", () => {
    const result = deriveBrandContext(
      "Acme Roofing vs Rival Roofing: which has better customer reviews?",
      [brand("Acme Roofing")],
      [brand("Rival Roofing")]
    );
    expect(result).toBe("client_and_competitor");
  });

  it("matching is case-insensitive", () => {
    const result = deriveBrandContext(
      "have you tried ACME ROOFING for a quote",
      [brand("Acme Roofing")],
      []
    );
    expect(result).toBe("client_branded");
  });

  it("supports regex-type aliases", () => {
    const result = deriveBrandContext(
      "Acme Roofing Co. handled our last job",
      [brand("Acme Roofing", [{ aliasText: "Acme\\s+Roofing\\s+Co\\.?", matchType: "regex" }])],
      []
    );
    expect(result).toBe("client_branded");
  });

  it("matches if any one of multiple client brands is present", () => {
    const result = deriveBrandContext(
      "Salvo Metal Works handled our roof replacement",
      [brand("Acme Roofing"), brand("Salvo Metal Works")],
      []
    );
    expect(result).toBe("client_branded");
  });

  it("matches if any one of multiple competitor brands is present", () => {
    const result = deriveBrandContext(
      "United Rentals also offers portable restrooms",
      [brand("Royal Porta Johns")],
      [brand("United Site Services"), brand("United Rentals")]
    );
    expect(result).toBe("competitor_branded");
  });

  it("returns 'unbranded' when both brand lists are empty", () => {
    const result = deriveBrandContext("Best roofers near me", [], []);
    expect(result).toBe("unbranded");
  });
});
