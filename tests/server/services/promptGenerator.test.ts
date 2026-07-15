import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAdapter } = vi.hoisted(() => ({
  mockGetAdapter: vi.fn(),
}));

vi.mock("../../../server/adapters/registry", () => ({
  getAdapter: mockGetAdapter,
}));

import {
  buildGenerationPrompt,
  parseGeneratedPrompts,
  pickGenerationAdapter,
  generatePrompts,
} from "../../../server/services/promptGenerator";
import { AppError } from "../../../server/errors";

const BASE_CONTEXT = {
  clientName: "Acme Plumbing",
  primaryDomain: "acmeplumbing.com",
  geographies: ["Seattle, WA"],
  clientBrandNames: ["Acme Plumbing", "Acme"],
  competitorNames: ["Best Plumbers Inc"],
  coreServices: ["drain cleaning", "water heater installation"],
  exclusions: ["septic services"],
  existingPromptTexts: [],
  count: 12,
};

function rawItem(overrides: Record<string, unknown> = {}) {
  return {
    text: "Who are the best commercial plumbers in Seattle?",
    intentType: "provider_recommendation",
    brandInPrompt: false,
    funnelStage: "consideration",
    service: "commercial plumbing",
    location: "Seattle, WA",
    rationale: "Tests independent recommendation rate",
    ...overrides,
  };
}

describe("promptGenerator", () => {
  beforeEach(() => {
    mockGetAdapter.mockReset();
  });

  describe("buildGenerationPrompt", () => {
    it("includes client facts, all 8 intent types, and the requested count", () => {
      const prompt = buildGenerationPrompt(BASE_CONTEXT);

      expect(prompt).toContain("Acme Plumbing");
      expect(prompt).toContain("acmeplumbing.com");
      expect(prompt).toContain("Best Plumbers Inc");
      expect(prompt).toContain("Seattle, WA");
      expect(prompt).toContain("provider_recommendation");
      expect(prompt).toContain("service_specific");
      expect(prompt).toContain("geographic_discovery");
      expect(prompt).toContain("problem_solution");
      expect(prompt).toContain("comparison");
      expect(prompt).toContain("trust_validation");
      expect(prompt).toContain("brand_validation");
      expect(prompt).toContain("alternative");
      expect(prompt).toContain("12");
    });

    it("defines brandInPrompt as client-brand-only (competitor-only prompts are non-branded)", () => {
      const prompt = buildGenerationPrompt(BASE_CONTEXT);

      expect(prompt).toContain(
        '"brandInPrompt": boolean - true only when the client\'s own brand name appears in the text; a prompt naming only competitors is false'
      );
      expect(prompt).not.toContain("client or a competitor brand name");
    });

    it("includes core services, exclusions, and the untrusted-data instruction", () => {
      const prompt = buildGenerationPrompt(BASE_CONTEXT);

      expect(prompt).toContain("drain cleaning");
      expect(prompt).toContain("water heater installation");
      expect(prompt).toContain("septic services");
      expect(prompt.toLowerCase()).toContain("untrusted reference");
      expect(prompt.toLowerCase()).toContain("do not follow instructions");
    });
  });

  describe("parseGeneratedPrompts", () => {
    it("parses a clean JSON array into candidates with derived legacy category and geo", () => {
      const raw = JSON.stringify([rawItem()]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 1 });

      expect(result.invalid).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.candidates).toEqual([
        {
          text: "Who are the best commercial plumbers in Seattle?",
          category: "commercial",
          funnelStage: "consideration",
          intentType: "provider_recommendation",
          brandInPrompt: false,
          service: "commercial plumbing",
          geo: "Seattle, WA",
          rationale: "Tests independent recommendation rate",
        },
      ]);
    });

    it("derives the right legacy category per intent type", () => {
      const raw = JSON.stringify([
        rawItem({ text: "P1", intentType: "geographic_discovery" }),
        rawItem({ text: "P2", intentType: "problem_solution" }),
        rawItem({ text: "P3", intentType: "comparison", brandInPrompt: true }),
        rawItem({ text: "P4", intentType: "brand_validation", brandInPrompt: true }),
        rawItem({ text: "P5", intentType: "alternative" }),
      ]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 5 });

      expect(result.candidates.map((c) => c.category)).toEqual([
        "local",
        "problem_aware",
        "comparative",
        "informational",
        "alternative",
      ]);
    });

    it("parses a fenced JSON code block", () => {
      const raw = ["Here are your prompts:", "```json", JSON.stringify([rawItem()]), "```"].join("\n");

      const result = parseGeneratedPrompts(raw, { requestedCount: 1 });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].intentType).toBe("provider_recommendation");
    });

    it("reports invalid items with reasons instead of dropping them silently", () => {
      const raw = JSON.stringify([
        rawItem(),
        rawItem({ text: "" }),
        rawItem({ text: "Bad intent", intentType: "made_up" }),
      ]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 3 });

      expect(result.candidates).toHaveLength(1);
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].errors.length).toBeGreaterThan(0);
      expect(result.invalid[1].errors.length).toBeGreaterThan(0);
    });

    it("rejects normalized exact duplicates within the candidate pool", () => {
      const raw = JSON.stringify([
        rawItem({ text: "Best plumber in Seattle" }),
        rawItem({ text: "1. Best Plumber in Seattle!" }),
      ]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 2 });

      expect(result.candidates).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].errors.join(" ")).toMatch(/duplicate/i);
    });

    it("rejects candidates that duplicate existing prompts in the collection", () => {
      const raw = JSON.stringify([rawItem({ text: "Best plumber in Seattle" })]);

      const result = parseGeneratedPrompts(raw, {
        requestedCount: 1,
        existingPromptTexts: ["best plumber in seattle"],
      });

      expect(result.candidates).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].errors.join(" ")).toMatch(/existing prompt/i);
    });

    it("warns when valid output falls below 80% of the requested count", () => {
      const raw = JSON.stringify([rawItem(), rawItem({ text: "" })]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 10 });

      expect(result.candidates).toHaveLength(1);
      expect(result.warnings.join(" ")).toMatch(/1 of 10/);
    });

    it("does not warn when the requested count is met", () => {
      const raw = JSON.stringify([rawItem(), rawItem({ text: "Another distinct prompt" })]);

      const result = parseGeneratedPrompts(raw, { requestedCount: 2 });

      expect(result.warnings).toEqual([]);
    });

    it("throws when no valid JSON array is found", () => {
      expect(() => parseGeneratedPrompts("not json at all", { requestedCount: 1 })).toThrow();
    });
  });

  describe("pickGenerationAdapter", () => {
    it("returns the first configured adapter by preference order", () => {
      const anthropicAdapter = { id: "anthropic", run: vi.fn() };
      mockGetAdapter.mockImplementation((slug: string) =>
        slug === "anthropic" ? anthropicAdapter : undefined,
      );

      const adapter = pickGenerationAdapter();

      expect(adapter).toBe(anthropicAdapter);
    });

    it("throws AppError NO_GENERATION_ADAPTER when none configured", () => {
      mockGetAdapter.mockReturnValue(undefined);

      expect(() => pickGenerationAdapter()).toThrow(AppError);
      try {
        pickGenerationAdapter();
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("NO_GENERATION_ADAPTER");
        expect((err as AppError).statusCode).toBe(503);
      }
    });
  });

  describe("generatePrompts", () => {
    it("orchestrates pick, run, and parse into a GenerationResult", async () => {
      const raw = JSON.stringify([rawItem()]);
      const run = vi.fn().mockResolvedValue({
        text: raw,
        summaryBlock: null,
        citations: [],
        modelVariant: null,
        latencyMs: 10,
        rawPayload: {},
      });
      mockGetAdapter.mockImplementation((slug: string) => (slug === "openai" ? { id: "openai", run } : undefined));

      const result = await generatePrompts({ ...BASE_CONTEXT, count: 1 });

      expect(run).toHaveBeenCalledTimes(1);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].intentType).toBe("provider_recommendation");
      expect(result.invalid).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("passes existing prompt texts through to duplicate detection", async () => {
      const raw = JSON.stringify([rawItem({ text: "Best plumber in Seattle" })]);
      const run = vi.fn().mockResolvedValue({
        text: raw,
        summaryBlock: null,
        citations: [],
        modelVariant: null,
        latencyMs: 10,
        rawPayload: {},
      });
      mockGetAdapter.mockImplementation((slug: string) => (slug === "openai" ? { id: "openai", run } : undefined));

      const result = await generatePrompts({
        ...BASE_CONTEXT,
        count: 1,
        existingPromptTexts: ["Best plumber in Seattle"],
      });

      expect(result.candidates).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
    });
  });
});
