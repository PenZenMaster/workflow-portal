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

describe("promptGenerator", () => {
  beforeEach(() => {
    mockGetAdapter.mockReset();
  });

  describe("buildGenerationPrompt", () => {
    it("includes client name, domain, competitor names, and all 6 category names", () => {
      const prompt = buildGenerationPrompt({
        clientName: "Acme Plumbing",
        primaryDomain: "acmeplumbing.com",
        geographies: ["Seattle, WA"],
        clientBrandNames: ["Acme Plumbing", "Acme"],
        competitorNames: ["Best Plumbers Inc"],
        count: 12,
      });

      expect(prompt).toContain("Acme Plumbing");
      expect(prompt).toContain("acmeplumbing.com");
      expect(prompt).toContain("Best Plumbers Inc");
      expect(prompt).toContain("Seattle, WA");
      expect(prompt).toContain("informational");
      expect(prompt).toContain("comparative");
      expect(prompt).toContain("commercial");
      expect(prompt).toContain("local");
      expect(prompt).toContain("problem_aware");
      expect(prompt).toContain("alternative");
      expect(prompt).toContain("12");
    });
  });

  describe("parseGeneratedPrompts", () => {
    it("parses a clean JSON array", () => {
      const raw = JSON.stringify([
        { text: "What is the best way to fix a leaky faucet?", category: "informational", funnelStage: "awareness" },
      ]);

      const result = parseGeneratedPrompts(raw);

      expect(result).toEqual([
        { text: "What is the best way to fix a leaky faucet?", category: "informational", funnelStage: "awareness" },
      ]);
    });

    it("parses a fenced JSON code block", () => {
      const raw = [
        "Here are your prompts:",
        "```json",
        JSON.stringify([
          { text: "Best plumber near Seattle", category: "local", funnelStage: "decision" },
        ]),
        "```",
      ].join("\n");

      const result = parseGeneratedPrompts(raw);

      expect(result).toEqual([
        { text: "Best plumber near Seattle", category: "local", funnelStage: "decision" },
      ]);
    });

    it("parses JSON surrounded by prose", () => {
      const raw = `Sure! ${JSON.stringify([
        { text: "Alternatives to Best Plumbers Inc", category: "alternative", funnelStage: "consideration" },
      ])} Hope that helps.`;

      const result = parseGeneratedPrompts(raw);

      expect(result).toEqual([
        { text: "Alternatives to Best Plumbers Inc", category: "alternative", funnelStage: "consideration" },
      ]);
    });

    it("drops items with unknown category or empty text", () => {
      const raw = JSON.stringify([
        { text: "Valid prompt", category: "informational", funnelStage: "awareness" },
        { text: "", category: "informational", funnelStage: "awareness" },
        { text: "Bad category", category: "made_up", funnelStage: "awareness" },
      ]);

      const result = parseGeneratedPrompts(raw);

      expect(result).toEqual([
        { text: "Valid prompt", category: "informational", funnelStage: "awareness" },
      ]);
    });

    it("throws when no valid JSON array is found", () => {
      expect(() => parseGeneratedPrompts("not json at all")).toThrow();
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
    it("orchestrates pick, run, and parse", async () => {
      const raw = JSON.stringify([
        { text: "What is the best way to fix a leaky faucet?", category: "informational", funnelStage: "awareness" },
      ]);
      const run = vi.fn().mockResolvedValue({
        text: raw,
        summaryBlock: null,
        citations: [],
        modelVariant: null,
        latencyMs: 10,
        rawPayload: {},
      });
      mockGetAdapter.mockImplementation((slug: string) => (slug === "openai" ? { id: "openai", run } : undefined));

      const candidates = await generatePrompts({
        clientName: "Acme Plumbing",
        primaryDomain: "acmeplumbing.com",
        geographies: [],
        clientBrandNames: ["Acme Plumbing"],
        competitorNames: [],
        count: 1,
      });

      expect(run).toHaveBeenCalledTimes(1);
      expect(candidates).toEqual([
        { text: "What is the best way to fix a leaky faucet?", category: "informational", funnelStage: "awareness" },
      ]);
    });
  });
});
