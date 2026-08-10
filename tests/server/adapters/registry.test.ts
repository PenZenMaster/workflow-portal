/*
 * Module/Script Name: registry.test.ts
 * Path: tests/server/adapters/registry.test.ts
 *
 * Description:
 * issue #3 Epic 1 slice 1: locks in the capability facts declared per
 * adapter (getAdapterCapabilities), independent of whether a platform's
 * API key is configured in this environment.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 issue #35 slice 1
 */

import { describe, it, expect } from "vitest";
import { getAdapterCapabilities } from "../../../server/adapters/registry";

describe("getAdapterCapabilities", () => {
  it("returns Perplexity's native structured citation capabilities", () => {
    const caps = getAdapterCapabilities("perplexity");
    expect(caps).toEqual({
      citationSupport: true,
      orderedCitationSupport: true,
      webSearchGrounding: true,
      modelSelection: true,
      temperatureControl: false,
      locationContext: true,
      citationExtractionMethod: "native_structured",
    });
  });

  it.each(["openai", "anthropic", "gemini", "groq", "mistral", "deepseek"])(
    "returns the shared regex-extraction capabilities for %s (no native citation support)",
    (slug) => {
      const caps = getAdapterCapabilities(slug);
      expect(caps).toEqual({
        citationSupport: false,
        orderedCitationSupport: false,
        webSearchGrounding: false,
        modelSelection: true,
        temperatureControl: false,
        locationContext: true,
        citationExtractionMethod: "text_url_regex",
      });
    }
  );

  it("returns undefined for an unknown slug", () => {
    expect(getAdapterCapabilities("not-a-real-platform")).toBeUndefined();
  });

  it("resolves capabilities independent of whether the platform's API key is configured", () => {
    // No API key env vars are set in this test process - getAdapter()
    // would return undefined for all of these, but capabilities are a
    // static fact about the adapter type, not the current environment.
    expect(getAdapterCapabilities("anthropic")).toBeDefined();
  });
});
