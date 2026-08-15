/*
 * Module/Script Name: rankrocketMcp.test.ts
 * Path: tests/server/adapters/rankrocketMcp.test.ts
 *
 * Description:
 * Tests for getRankRocketMcpAdapter() - the dedicated AnthropicAdapter
 * factory wired to the rankrocket-mcp remote MCP server (Phase 3, read-only
 * slice). Locks in env-var gating and the request shape sent to Anthropic.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-15
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getRankRocketMcpAdapter } from "../../../server/adapters/registry";

const ANTHROPIC_BODY = {
  id: "msg_test",
  model: "claude-opus-5",
  content: [{ type: "text", text: "The plugin is active." }],
  usage: { input_tokens: 1, output_tokens: 1 },
};

function mockFetch(body: unknown) {
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

function sentBody(f: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
}

function sentHeaders(f: ReturnType<typeof vi.fn>): Record<string, string> {
  return (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("getRankRocketMcpAdapter", () => {
  it("returns undefined when ANTHROPIC_API_KEY is not configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    expect(getRankRocketMcpAdapter()).toBeUndefined();
  });

  it("returns undefined when RANKROCKET_MCP_TOKEN is not configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "");
    expect(getRankRocketMcpAdapter()).toBeUndefined();
  });

  it("builds an adapter targeting the default production MCP URL when RANKROCKET_MCP_URL is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    vi.stubEnv("RANKROCKET_MCP_URL", "");
    const f = mockFetch(ANTHROPIC_BODY);
    vi.stubGlobal("fetch", f);

    const adapter = getRankRocketMcpAdapter()!;
    await adapter.run("p");

    const body = sentBody(f);
    expect(body.mcp_servers).toEqual([
      {
        type: "url",
        url: "https://mcp.fullmetaljacketseo.com/mcp",
        name: "rankrocket",
        authorization_token: "rrmcp-token",
      },
    ]);
    expect(body.tools).toEqual([{ type: "mcp_toolset", mcp_server_name: "rankrocket" }]);
    expect(sentHeaders(f)["anthropic-beta"]).toBe("mcp-client-2025-11-20");
    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(4096);
  });

  it("honors a RANKROCKET_MCP_URL override", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    vi.stubEnv("RANKROCKET_MCP_URL", "https://mcp.staging.example.com/mcp");
    const f = mockFetch(ANTHROPIC_BODY);
    vi.stubGlobal("fetch", f);

    const adapter = getRankRocketMcpAdapter()!;
    await adapter.run("p");

    const body = sentBody(f);
    expect((body.mcp_servers as Array<{ url: string }>)[0].url).toBe(
      "https://mcp.staging.example.com/mcp"
    );
  });
});
