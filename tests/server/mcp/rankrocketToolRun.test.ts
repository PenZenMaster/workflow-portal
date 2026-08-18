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

const { runRankRocketReadOnlyPrompt, isRankRocketMcpConfigured } = await import(
  "../../../server/mcp/rankrocketToolRun"
);
const { AppError } = await import("../../../server/errors");

const CONFIG = {
  apiKey: "sk-ant-test",
  url: "https://mcp.example.com/mcp",
  token: "rrmcp-token",
  model: "claude-opus-5",
  maxTokens: 4096,
  timeoutMs: 60000,
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

describe("runRankRocketReadOnlyPrompt", () => {
  it("throws AppError 503 RANKROCKET_MCP_NOT_CONFIGURED when the config is missing", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);
    await expect(runRankRocketReadOnlyPrompt("p")).rejects.toMatchObject({
      statusCode: 503,
      code: "RANKROCKET_MCP_NOT_CONFIGURED",
    });
    await expect(runRankRocketReadOnlyPrompt("p")).rejects.toBeInstanceOf(AppError);
    expect(mockConnectMcpClient).not.toHaveBeenCalled();
  });

  it("connects the MCP client and runs the tool loop with the given prompt", async () => {
    await runRankRocketReadOnlyPrompt("Investigate site status.");

    expect(mockConnectMcpClient).toHaveBeenCalledWith(CONFIG.url, CONFIG.token);
    const [apiKey, model, prompt] = mockRunAnthropicWithTools.mock.calls[0] as [string, string, string];
    expect(apiKey).toBe(CONFIG.apiKey);
    expect(model).toBe(CONFIG.model);
    expect(prompt).toBe("Investigate site status.");
  });

  it("filters the tool list down to the read-only allowlist before passing tools to the loop", async () => {
    await runRankRocketReadOnlyPrompt("p");

    const tools = mockRunAnthropicWithTools.mock.calls[0][3] as Array<{ name: string }>;
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("rankrocket_status");
    expect(toolNames).not.toContain("rankrocket_action_execute");
  });

  it("wires the executeTool callback to the MCP client's callTool", async () => {
    await runRankRocketReadOnlyPrompt("p");

    const executeTool = mockRunAnthropicWithTools.mock.calls[0][4] as (
      name: string,
      input: unknown
    ) => Promise<unknown>;
    await executeTool("rankrocket_status", { site: "tristate-hvac" });
    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_status", { site: "tristate-hvac" });
  });

  it("closes the MCP client after a successful run", async () => {
    await runRankRocketReadOnlyPrompt("p");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("closes the MCP client even when the tool loop throws", async () => {
    mockRunAnthropicWithTools.mockRejectedValue(new Error("boom"));
    await expect(runRankRocketReadOnlyPrompt("p")).rejects.toThrow("boom");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("returns the RawResponse from the tool loop", async () => {
    const result = await runRankRocketReadOnlyPrompt("p");
    expect(result.text).toBe("The plugin is active.");
  });

  it("passes maxIterations through to the tool loop when provided", async () => {
    await runRankRocketReadOnlyPrompt("p", { maxIterations: 20 });

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { maxIterations?: number };
    expect(opts?.maxIterations).toBe(20);
  });

  it("does not pass maxIterations when omitted, leaving the tool loop's own default", async () => {
    await runRankRocketReadOnlyPrompt("p");

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { maxIterations?: number } | undefined;
    expect(opts?.maxIterations).toBeUndefined();
  });

  it("passes the configured maxTokens through to the tool loop by default", async () => {
    await runRankRocketReadOnlyPrompt("p");

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { maxTokens?: number };
    expect(opts?.maxTokens).toBe(4096);
  });

  it("lets a caller-supplied maxTokens override the configured default", async () => {
    await runRankRocketReadOnlyPrompt("p", { maxTokens: 8000 });

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { maxTokens?: number };
    expect(opts?.maxTokens).toBe(8000);
  });

  it("passes the configured timeoutMs through to the tool loop by default", async () => {
    await runRankRocketReadOnlyPrompt("p");

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { timeoutMs?: number };
    expect(opts?.timeoutMs).toBe(60000);
  });

  it("lets a caller-supplied timeoutMs override the configured default", async () => {
    await runRankRocketReadOnlyPrompt("p", { timeoutMs: 120000 });

    const opts = mockRunAnthropicWithTools.mock.calls[0][5] as { timeoutMs?: number };
    expect(opts?.timeoutMs).toBe(120000);
  });
});

describe("isRankRocketMcpConfigured", () => {
  it("returns true when the MCP config is present", () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    expect(isRankRocketMcpConfigured()).toBe(true);
  });

  it("returns false when the MCP config is missing", () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);
    expect(isRankRocketMcpConfigured()).toBe(false);
  });
});
