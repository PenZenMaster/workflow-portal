/*
 * Module/Script Name: rankrocketMcpConfig.test.ts
 * Path: tests/server/adapters/rankrocketMcpConfig.test.ts
 *
 * Description:
 * Tests for getRankRocketMcpConfig() - plain env-var-derived config for
 * workflow-portal's own MCP client + tool loop talking to rankrocket-mcp
 * (Phase 3 v2, replacing the non-functional Anthropic MCP connector
 * approach). No AnthropicAdapter instance involved anymore.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getRankRocketMcpConfig, RANKROCKET_MCP_MODEL } from "../../../server/adapters/registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRankRocketMcpConfig", () => {
  it("returns undefined when ANTHROPIC_API_KEY is not configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    expect(getRankRocketMcpConfig()).toBeUndefined();
  });

  it("returns undefined when RANKROCKET_MCP_TOKEN is not configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "");
    expect(getRankRocketMcpConfig()).toBeUndefined();
  });

  it("returns the config with the default production URL when RANKROCKET_MCP_URL is unset", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    vi.stubEnv("RANKROCKET_MCP_URL", "");

    expect(getRankRocketMcpConfig()).toEqual({
      apiKey: "sk-ant-test",
      url: "https://mcp.fullmetaljacketseo.com/mcp",
      token: "rrmcp-token",
      model: RANKROCKET_MCP_MODEL,
    });
  });

  it("honors a RANKROCKET_MCP_URL override", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("RANKROCKET_MCP_TOKEN", "rrmcp-token");
    vi.stubEnv("RANKROCKET_MCP_URL", "https://mcp.staging.example.com/mcp");

    expect(getRankRocketMcpConfig()?.url).toBe("https://mcp.staging.example.com/mcp");
  });
});
