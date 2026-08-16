/*
 * Module/Script Name: workflowPromptRun.test.ts
 * Path: tests/server/services/workflowPromptRun.test.ts
 *
 * Description:
 * Tests for the RankRocket MCP in-app prompt run service (Phase 3 v2):
 * <PASTE> token filling, connecting workflow-portal's own MCP client,
 * filtering to the read-only tool allowlist, and running the hand-rolled
 * Anthropic tool loop. Replaces the Phase-3-v1 test that mocked a single
 * getRankRocketMcpAdapter() adapter instance.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation (Phase 3 v1, AnthropicAdapter + MCP connector)
 * - v2.00 Phase 3 v2: workflow-portal's own MCP client + hand-rolled tool loop
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRankRocketMcpConfig = vi.fn();
vi.mock("../../../server/adapters/registry", () => ({
  getRankRocketMcpConfig: () => mockGetRankRocketMcpConfig(),
}));

const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockClose = vi.fn();
const mockConnectMcpClient = vi.fn();
vi.mock("../../../server/mcp/mcpClient", () => ({
  connectMcpClient: (...args: unknown[]) => mockConnectMcpClient(...args),
}));

const mockRunAnthropicWithTools = vi.fn();
vi.mock("../../../server/adapters/anthropicToolLoop", () => ({
  runAnthropicWithTools: (...args: unknown[]) => mockRunAnthropicWithTools(...args),
}));

const { runWorkflowPrompt } = await import("../../../server/services/workflowPromptRun");
const { AppError } = await import("../../../server/errors");

const CONFIG = {
  apiKey: "sk-ant-test",
  url: "https://mcp.example.com/mcp",
  token: "rrmcp-token",
  model: "claude-opus-5",
};

const ALL_TOOLS = [
  { name: "rankrocket_status", description: "Get status", inputSchema: { type: "object" } },
  { name: "rankrocket_action_execute", description: "Execute an action", inputSchema: { type: "object" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
  mockListTools.mockResolvedValue(ALL_TOOLS);
  mockCallTool.mockResolvedValue({ isError: false, content: "ok" });
  mockClose.mockResolvedValue(undefined);
  mockConnectMcpClient.mockResolvedValue({
    listTools: mockListTools,
    callTool: mockCallTool,
    close: mockClose,
  });
  mockRunAnthropicWithTools.mockResolvedValue({
    text: "The plugin is active.",
    summaryBlock: null,
    citations: [],
    requestedModel: "claude-opus-5",
    modelVariant: "claude-opus-5",
    latencyMs: 1,
    rawPayload: {},
    usage: null,
  });
});

describe("runWorkflowPrompt", () => {
  it("throws AppError 503 RANKROCKET_MCP_NOT_CONFIGURED when the config is missing", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);
    await expect(runWorkflowPrompt("Investigate <PASTE>.", ["tristate-hvac"])).rejects.toMatchObject({
      statusCode: 503,
      code: "RANKROCKET_MCP_NOT_CONFIGURED",
    });
    await expect(runWorkflowPrompt("p")).rejects.toBeInstanceOf(AppError);
    expect(mockConnectMcpClient).not.toHaveBeenCalled();
  });

  it("fills <PASTE> tokens, connects the MCP client, and runs the tool loop with the filled prompt", async () => {
    await runWorkflowPrompt("Site key: <PASTE>\nQuestion: <PASTE>", [
      "tristate-hvac",
      "What's the plugin status?",
    ]);

    expect(mockConnectMcpClient).toHaveBeenCalledWith(CONFIG.url, CONFIG.token);
    const [apiKey, model, prompt] = mockRunAnthropicWithTools.mock.calls[0] as [string, string, string];
    expect(apiKey).toBe(CONFIG.apiKey);
    expect(model).toBe(CONFIG.model);
    expect(prompt).toBe("Site key: tristate-hvac\nQuestion: What's the plugin status?");
  });

  it("filters the tool list down to the read-only allowlist before passing tools to the loop", async () => {
    await runWorkflowPrompt("p");

    const tools = mockRunAnthropicWithTools.mock.calls[0][3] as Array<{ name: string }>;
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("rankrocket_status");
    expect(toolNames).not.toContain("rankrocket_action_execute");
  });

  it("wires the executeTool callback to the MCP client's callTool", async () => {
    await runWorkflowPrompt("p");

    const executeTool = mockRunAnthropicWithTools.mock.calls[0][4] as (
      name: string,
      input: unknown
    ) => Promise<unknown>;
    await executeTool("rankrocket_status", { site: "tristate-hvac" });
    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_status", { site: "tristate-hvac" });
  });

  it("closes the MCP client after a successful run", async () => {
    await runWorkflowPrompt("p");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("closes the MCP client even when the tool loop throws", async () => {
    mockRunAnthropicWithTools.mockRejectedValue(new Error("boom"));
    await expect(runWorkflowPrompt("p")).rejects.toThrow("boom");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("returns the RawResponse from the tool loop", async () => {
    const result = await runWorkflowPrompt("p");
    expect(result.text).toBe("The plugin is active.");
  });

  it("defaults to an empty inputValues array", async () => {
    await runWorkflowPrompt("No tokens here.");
    const prompt = mockRunAnthropicWithTools.mock.calls[0][2] as string;
    expect(prompt).toBe("No tokens here.");
  });
});
