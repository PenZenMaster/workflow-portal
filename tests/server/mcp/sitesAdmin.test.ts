/*
 * Module/Script Name: sitesAdmin.test.ts
 * Path: tests/server/mcp/sitesAdmin.test.ts
 *
 * Description:
 * Tests for RankRocket Site Insights admin CRUD, Part B:
 * listSitesDetail/upsertSite/deleteSite - thin wrappers calling
 * rankrocket-mcp's rankrocket_sites_detail/rankrocket_sites_write tools
 * directly via workflow-portal's own MCP client, never through the
 * Claude tool loop. Mocks getRankRocketMcpConfig()/connectMcpClient() at
 * the module boundary, matching sitesCache.test.ts's established style.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part B
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRankRocketMcpConfig = vi.fn();
const mockConnectMcpClient = vi.fn();
const mockRefreshRankRocketSitesCache = vi.fn();

vi.mock("../../../server/adapters/registry", () => ({
  getRankRocketMcpConfig: mockGetRankRocketMcpConfig,
}));
vi.mock("../../../server/mcp/mcpClient", () => ({
  connectMcpClient: mockConnectMcpClient,
}));
vi.mock("../../../server/mcp/sitesCache", () => ({
  refreshRankRocketSitesCache: mockRefreshRankRocketSitesCache,
}));

const { listSitesDetail, upsertSite, deleteSite } = await import("../../../server/mcp/sitesAdmin");

const CONFIG = {
  apiKey: "sk-ant-test",
  url: "https://mcp.example.com/mcp",
  token: "rrmcp-token",
  model: "claude-opus-5",
};

beforeEach(() => {
  vi.clearAllMocks();
});

function mockClient(callToolResult: { isError: boolean; content: string }) {
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockCallTool = vi.fn().mockResolvedValue(callToolResult);
  mockConnectMcpClient.mockResolvedValue({ callTool: mockCallTool, close: mockClose, listTools: vi.fn() });
  return { mockCallTool, mockClose };
}

describe("listSitesDetail", () => {
  it("throws when RankRocket MCP is not configured", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);
    await expect(listSitesDetail()).rejects.toThrow(/not configured/i);
    expect(mockConnectMcpClient).not.toHaveBeenCalled();
  });

  it("calls rankrocket_sites_detail and returns the parsed site list", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const { mockCallTool, mockClose } = mockClient({
      isError: false,
      content: JSON.stringify({ sites: [{ key: "tristate-hvac", baseUrl: "https://x.com", authUser: "admin" }] }),
    });

    const result = await listSitesDetail();

    expect(mockConnectMcpClient).toHaveBeenCalledWith(CONFIG.url, CONFIG.token);
    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_sites_detail", {});
    expect(result).toEqual([{ key: "tristate-hvac", baseUrl: "https://x.com", authUser: "admin" }]);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws when the tool call reports isError", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClient({ isError: true, content: "boom" });

    await expect(listSitesDetail()).rejects.toThrow("boom");
  });
});

describe("upsertSite", () => {
  it("throws when RankRocket MCP is not configured", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(undefined);
    await expect(
      upsertSite("add", "new-site", { baseUrl: "https://x.com", authUser: "a", appPassword: "p" })
    ).rejects.toThrow(/not configured/i);
  });

  it("calls rankrocket_sites_write with confirm:true and the given operation/fields", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const { mockCallTool } = mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await upsertSite("add", "new-site", { baseUrl: "https://new-site.com", authUser: "admin", appPassword: "secret pass" });

    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_sites_write", {
      operation: "add",
      key: "new-site",
      baseUrl: "https://new-site.com",
      authUser: "admin",
      appPassword: "secret pass",
      confirm: true,
    });
  });

  it("refreshes the site-key cache after a successful write", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await upsertSite("update", "tristate-hvac", { baseUrl: "https://x.com", authUser: "a", appPassword: "p" });

    expect(mockRefreshRankRocketSitesCache).toHaveBeenCalledTimes(1);
  });

  it("throws and does not refresh the cache when the tool call reports isError", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClient({ isError: true, content: "validation failed" });

    await expect(
      upsertSite("add", "new-site", { baseUrl: "https://x.com", authUser: "a", appPassword: "p" })
    ).rejects.toThrow("validation failed");
    expect(mockRefreshRankRocketSitesCache).not.toHaveBeenCalled();
  });
});

describe("deleteSite", () => {
  it("calls rankrocket_sites_write with operation delete and confirm:true", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const { mockCallTool } = mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await deleteSite("tristate-hvac");

    expect(mockCallTool).toHaveBeenCalledWith("rankrocket_sites_write", {
      operation: "delete",
      key: "tristate-hvac",
      confirm: true,
    });
  });

  it("refreshes the site-key cache after a successful delete", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await deleteSite("tristate-hvac");

    expect(mockRefreshRankRocketSitesCache).toHaveBeenCalledTimes(1);
  });

  it("throws when the tool call reports isError", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClient({ isError: true, content: 'Unknown site "nope"' });

    await expect(deleteSite("nope")).rejects.toThrow(/Unknown site/);
  });
});
