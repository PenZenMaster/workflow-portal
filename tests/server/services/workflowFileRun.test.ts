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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdapter = vi.fn();
vi.mock("../../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
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
});

describe("runWorkflowWithCsv", () => {
  beforeEach(() => {
    mockGetAdapter.mockReset();
  });

  it("throws AppError 503 NO_GENERATION_ADAPTER when no adapter is configured", async () => {
    mockGetAdapter.mockReturnValue(undefined);
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
    mockGetAdapter.mockImplementation((slug: string) =>
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
});
