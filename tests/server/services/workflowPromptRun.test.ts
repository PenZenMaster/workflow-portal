/*
 * Module/Script Name: workflowPromptRun.test.ts
 * Path: tests/server/services/workflowPromptRun.test.ts
 *
 * Description:
 * Tests for the RankRocket MCP in-app prompt run service (Phase 3,
 * read-only slice): <PASTE> token filling (reusing workflowFileRun's
 * utilities) and adapter orchestration via getRankRocketMcpAdapter().
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-15
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRankRocketMcpAdapter = vi.fn();
vi.mock("../../../server/adapters/registry", () => ({
  getRankRocketMcpAdapter: () => mockGetRankRocketMcpAdapter(),
}));

const { runWorkflowPrompt } = await import("../../../server/services/workflowPromptRun");
const { AppError } = await import("../../../server/errors");

describe("runWorkflowPrompt", () => {
  beforeEach(() => {
    mockGetRankRocketMcpAdapter.mockReset();
  });

  it("throws AppError 503 RANKROCKET_MCP_NOT_CONFIGURED when the adapter is not configured", async () => {
    mockGetRankRocketMcpAdapter.mockReturnValue(undefined);
    await expect(runWorkflowPrompt("Investigate <PASTE>.", ["tristate-hvac"])).rejects.toMatchObject({
      statusCode: 503,
      code: "RANKROCKET_MCP_NOT_CONFIGURED",
    });
    await expect(runWorkflowPrompt("p")).rejects.toBeInstanceOf(AppError);
  });

  it("fills <PASTE> tokens from inputValues and sends the result to the adapter", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "The plugin is active and alt-text coverage is 92%.",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1200,
      rawPayload: {},
      usage: null,
    });
    mockGetRankRocketMcpAdapter.mockReturnValue({ id: "anthropic", run });

    const result = await runWorkflowPrompt("Site key: <PASTE>\nQuestion: <PASTE>", [
      "tristate-hvac",
      "What's the plugin status?",
    ]);

    expect(run).toHaveBeenCalledTimes(1);
    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toBe("Site key: tristate-hvac\nQuestion: What's the plugin status?");
    expect(result.text).toBe("The plugin is active and alt-text coverage is 92%.");
  });

  it("strips lines with unfilled <PASTE> tokens when fewer inputValues are given than tokens", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
    mockGetRankRocketMcpAdapter.mockReturnValue({ id: "anthropic", run });

    await runWorkflowPrompt("Site key: <PASTE>\nOptional note: <PASTE>", ["tristate-hvac"]);

    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toBe("Site key: tristate-hvac");
    expect(sentPrompt).not.toContain("<PASTE>");
  });

  it("defaults to an empty inputValues array", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
    mockGetRankRocketMcpAdapter.mockReturnValue({ id: "anthropic", run });

    await runWorkflowPrompt("No tokens here.");

    expect(run).toHaveBeenCalledWith("No tokens here.");
  });
});
