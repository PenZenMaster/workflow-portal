/*
 * Module/Script Name: sitesCache.test.ts
 * Path: tests/server/mcp/sitesCache.test.ts
 *
 * Description:
 * Tests for the boot-time RankRocket site-list cache -
 * refreshRankRocketSitesCache() / getCachedRankRocketSites(). Mocks
 * getRankRocketMcpConfig() and connectMcpClient() at the module boundary,
 * matching this repo's existing adapter/mcp test mocking style.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRankRocketMcpConfig = vi.fn();
const mockConnectMcpClient = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock("../../../server/adapters/registry", () => ({
  getRankRocketMcpConfig: mockGetRankRocketMcpConfig,
}));
vi.mock("../../../server/mcp/mcpClient", () => ({
  connectMcpClient: mockConnectMcpClient,
}));
vi.mock("../../../server/logger", () => ({
  logger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() },
}));

const { refreshRankRocketSitesCache, getCachedRankRocketSites } = await import(
  "../../../server/mcp/sitesCache"
);

const CONFIG = {
  apiKey: "sk-ant-test",
  url: "https://mcp.example.com/mcp",
  token: "rrmcp-token",
  model: "claude-opus-5",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshRankRocketSitesCache / getCachedRankRocketSites", () => {
  it("does not attempt to connect when RankRocket MCP is not configured", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);

    await refreshRankRocketSitesCache();

    expect(mockConnectMcpClient).not.toHaveBeenCalled();
    expect(getCachedRankRocketSites()).toEqual([]);
  });

  it("populates the cache from a successful rankrocket_sites call", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockCallTool = vi.fn().mockResolvedValue({
      isError: false,
      content: JSON.stringify({ sites: ["tristate-hvac", "trevoraspiranti"] }),
    });
    mockConnectMcpClient.mockResolvedValue({ callTool: mockCallTool, close: mockClose, listTools: vi.fn() });

    await refreshRankRocketSitesCache();

    expect(mockConnectMcpClient).toHaveBeenCalledWith(CONFIG.url, CONFIG.token);
    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_sites", {});
    expect(getCachedRankRocketSites()).toEqual(["tristate-hvac", "trevoraspiranti"]);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("clears the cache and logs a warning when the tool call reports isError", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockCallTool = vi.fn().mockResolvedValue({ isError: true, content: "boom" });
    mockConnectMcpClient.mockResolvedValue({ callTool: mockCallTool, close: mockClose, listTools: vi.fn() });

    await refreshRankRocketSitesCache();

    expect(getCachedRankRocketSites()).toEqual([]);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("clears the cache and logs a warning when connectMcpClient throws, without rejecting", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockConnectMcpClient.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(refreshRankRocketSitesCache()).resolves.toBeUndefined();

    expect(getCachedRankRocketSites()).toEqual([]);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("clears the cache when the tool result content is not valid JSON", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockCallTool = vi.fn().mockResolvedValue({ isError: false, content: "not json" });
    mockConnectMcpClient.mockResolvedValue({ callTool: mockCallTool, close: mockClose, listTools: vi.fn() });

    await refreshRankRocketSitesCache();

    expect(getCachedRankRocketSites()).toEqual([]);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("filters out non-string entries in the sites array", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockCallTool = vi.fn().mockResolvedValue({
      isError: false,
      content: JSON.stringify({ sites: ["good-site", 42, null, "another-site"] }),
    });
    mockConnectMcpClient.mockResolvedValue({ callTool: mockCallTool, close: mockClose, listTools: vi.fn() });

    await refreshRankRocketSitesCache();

    expect(getCachedRankRocketSites()).toEqual(["good-site", "another-site"]);
  });
});
