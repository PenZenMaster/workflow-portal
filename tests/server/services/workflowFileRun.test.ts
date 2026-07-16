/*
 * Module/Script Name: workflowFileRun.test.ts
 * Path: tests/server/services/workflowFileRun.test.ts
 *
 * Description:
 * Tests for the workflow CSV run service: prompt construction embedding the
 * full CSV, data-row counting, and adapter orchestration (503 when no LLM
 * adapter is configured).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial tests (workflow CSV upload feature, v1.20.0)
 * - v1.01 B-21: input values fill <PASTE> tokens; unfilled token lines stripped
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdapter = vi.fn();
const mockGetUtilityAdapter = vi.fn();
vi.mock("../../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
  getUtilityAdapter: (slug: string) => mockGetUtilityAdapter(slug),
  getConfiguredSlugs: () => [],
}));

const { buildCsvRunPrompt, countCsvDataRows, runWorkflowWithCsv } = await import(
  "../../../server/services/workflowFileRun"
);
const { AppError } = await import("../../../server/errors");

const CSV = "Keyword,Rank\nfoundation repair,3\nbasement waterproofing,7\n";

describe("countCsvDataRows", () => {
  it("counts data rows excluding the header", () => {
    expect(countCsvDataRows(CSV)).toBe(2);
  });

  it("ignores trailing blank lines and CRLF endings", () => {
    expect(countCsvDataRows("a,b\r\n1,2\r\n\r\n\r\n")).toBe(1);
  });

  it("returns 0 for a header-only file", () => {
    expect(countCsvDataRows("a,b\n")).toBe(0);
  });
});

describe("buildCsvRunPrompt", () => {
  it("embeds the workflow prompt, row count, and the full CSV text", () => {
    const prompt = buildCsvRunPrompt("Analyze this rank tracker export.", CSV);
    expect(prompt).toContain("Analyze this rank tracker export.");
    expect(prompt).toContain("2 data rows");
    expect(prompt).toContain("foundation repair,3");
    expect(prompt).toContain("basement waterproofing,7");
  });

  it("includes the filename when provided", () => {
    const prompt = buildCsvRunPrompt("Analyze.", CSV, "ranks-jun-2026.csv");
    expect(prompt).toContain("ranks-jun-2026.csv");
  });

  it("fills <PASTE> tokens in order from inputValues", () => {
    const template = "Client Name: <PASTE>\nDomain: <PASTE>\nAnalyze the export.";
    const prompt = buildCsvRunPrompt(template, CSV, undefined, [
      "Acme Foundation Repair",
      "acmefoundation.com",
    ]);
    expect(prompt).toContain("Client Name: Acme Foundation Repair");
    expect(prompt).toContain("Domain: acmefoundation.com");
    expect(prompt).not.toContain("<PASTE>");
  });

  it("strips lines whose <PASTE> token was left unfilled", () => {
    const template = "Client Name: <PASTE>\nGBP URL: <PASTE>\nAnalyze the export.";
    const prompt = buildCsvRunPrompt(template, CSV, undefined, ["Acme"]);
    expect(prompt).toContain("Client Name: Acme");
    expect(prompt).not.toContain("GBP URL:");
    expect(prompt).toContain("Analyze the export.");
    expect(prompt).not.toContain("<PASTE>");
  });

  it("treats a blank input value as unfilled and strips its line", () => {
    const template = "Client Name: <PASTE>\nGBP URL: <PASTE>\nAnalyze.";
    const prompt = buildCsvRunPrompt(template, CSV, undefined, ["Acme", "   "]);
    expect(prompt).toContain("Client Name: Acme");
    expect(prompt).not.toContain("GBP URL:");
    expect(prompt).not.toContain("<PASTE>");
  });

  it("strips all token lines when no inputValues are provided", () => {
    const template = "Client Name: <PASTE>\nDomain: <PASTE>\nAnalyze the export.";
    const prompt = buildCsvRunPrompt(template, CSV);
    expect(prompt).not.toContain("<PASTE>");
    expect(prompt).not.toContain("Client Name:");
    expect(prompt).toContain("Analyze the export.");
  });
});

describe("runWorkflowWithCsv", () => {
  beforeEach(() => {
    mockGetAdapter.mockReset();
    mockGetUtilityAdapter.mockReset();
  });

  it("throws AppError 503 NO_GENERATION_ADAPTER when no adapter is configured", async () => {
    mockGetUtilityAdapter.mockReturnValue(undefined);
    await expect(runWorkflowWithCsv("Analyze.", CSV)).rejects.toMatchObject({
      statusCode: 503,
      code: "NO_GENERATION_ADAPTER",
    });
    await expect(runWorkflowWithCsv("Analyze.", CSV)).rejects.toBeInstanceOf(AppError);
  });

  it("sends the built prompt to the first configured adapter and returns its response", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "Rankings look strong in local pack.",
      summaryBlock: null,
      citations: [],
      modelVariant: "gpt-test",
      latencyMs: 42,
      rawPayload: {},
    });
    mockGetUtilityAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run } : undefined
    );

    const result = await runWorkflowWithCsv("Analyze this export.", CSV, "ranks.csv");

    expect(run).toHaveBeenCalledTimes(1);
    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toContain("Analyze this export.");
    expect(sentPrompt).toContain("foundation repair,3");
    expect(sentPrompt).toContain("ranks.csv");
    expect(result.text).toBe("Rankings look strong in local pack.");
    expect(result.modelVariant).toBe("gpt-test");
  });

  it("passes inputValues through to the built prompt", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      modelVariant: "gpt-test",
      latencyMs: 1,
      rawPayload: {},
    });
    mockGetUtilityAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run } : undefined
    );

    await runWorkflowWithCsv("Client: <PASTE>\nAnalyze.", CSV, undefined, [
      "Acme Foundation Repair",
    ]);

    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toContain("Client: Acme Foundation Repair");
    expect(sentPrompt).not.toContain("<PASTE>");
  });

  it("uses the workflow's adapter slug when provided instead of the default order", async () => {
    const anthropicRun = vi.fn().mockResolvedValue({
      text: "claude says hi",
      summaryBlock: null,
      citations: [],
      modelVariant: "claude-test",
      latencyMs: 1,
      rawPayload: {},
    });
    const openaiRun = vi.fn();
    mockGetUtilityAdapter.mockImplementation((slug: string) => {
      if (slug === "anthropic") return { id: "anthropic", run: anthropicRun };
      if (slug === "openai") return { id: "openai", run: openaiRun };
      return undefined;
    });

    const result = await runWorkflowWithCsv("Analyze.", CSV, undefined, [], "anthropic");

    expect(anthropicRun).toHaveBeenCalledTimes(1);
    expect(openaiRun).not.toHaveBeenCalled();
    expect(result.modelVariant).toBe("claude-test");
  });

  it("throws 503 ADAPTER_NOT_CONFIGURED when the chosen adapter has no API key", async () => {
    mockGetUtilityAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run: vi.fn() } : undefined
    );

    await expect(
      runWorkflowWithCsv("Analyze.", CSV, undefined, [], "gemini")
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "ADAPTER_NOT_CONFIGURED",
    });
  });
});
