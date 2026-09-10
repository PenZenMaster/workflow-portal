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
const mockClientStoreList = vi.fn();
const mockClientStoreUpdate = vi.fn();

vi.mock("../../../server/adapters/registry", () => ({
  getRankRocketMcpConfig: mockGetRankRocketMcpConfig,
}));
vi.mock("../../../server/mcp/mcpClient", () => ({
  connectMcpClient: mockConnectMcpClient,
}));
vi.mock("../../../server/mcp/sitesCache", () => ({
  refreshRankRocketSitesCache: mockRefreshRankRocketSitesCache,
}));
vi.mock("../../../server/storage", () => ({
  clientStore: {
    list: (...args: unknown[]) => mockClientStoreList(...args),
    update: (...args: unknown[]) => mockClientStoreUpdate(...args),
  },
}));

const { listSitesDetail, upsertSite, deleteSite } = await import("../../../server/mcp/sitesAdmin");
const { AppError } = await import("../../../server/errors");

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Sample Client",
    primaryDomain: "example.com",
    geographies: [],
    exclusions: [],
    coreServices: [],
    ownerUserId: null,
    rankrocketSiteKey: null,
    gbpLocationName: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const CONFIG = {
  apiKey: "sk-ant-test",
  url: "https://mcp.example.com/mcp",
  token: "rrmcp-token",
  model: "claude-opus-5",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClientStoreList.mockResolvedValue([]);
  mockClientStoreUpdate.mockResolvedValue(undefined);
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
    expect(mockClientStoreList).not.toHaveBeenCalled();
  });

  it("calls rankrocket_sites_write with confirm:true and the given operation/fields, when a client matches the domain", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClientStoreList.mockResolvedValue([client({ id: 9, primaryDomain: "new-site.com" })]);
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
    mockClientStoreList.mockResolvedValue([client({ id: 9, primaryDomain: "x.com" })]);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await upsertSite("update", "tristate-hvac", { baseUrl: "https://x.com", authUser: "a", appPassword: "p" });

    expect(mockRefreshRankRocketSitesCache).toHaveBeenCalledTimes(1);
  });

  it("throws and does not refresh the cache when the tool call reports isError", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClientStoreList.mockResolvedValue([client({ id: 9, primaryDomain: "x.com" })]);
    mockClient({ isError: true, content: "validation failed" });

    await expect(
      upsertSite("add", "new-site", { baseUrl: "https://x.com", authUser: "a", appPassword: "p" })
    ).rejects.toThrow("validation failed");
    expect(mockRefreshRankRocketSitesCache).not.toHaveBeenCalled();
  });

  it("sets rankrocketSiteKey on the single client whose primaryDomain matches the base URL", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const trevor = client({ id: 4, name: "Trevor Aspiranti", primaryDomain: "tristate-hvac.com" });
    mockClientStoreList.mockResolvedValue([trevor]);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await upsertSite("add", "tristate-hvac", { baseUrl: "https://tristate-hvac.com", authUser: "a", appPassword: "p" });

    expect(mockClientStoreUpdate).toHaveBeenCalledWith(4, {
      name: "Trevor Aspiranti",
      primaryDomain: "tristate-hvac.com",
      geographies: [],
      exclusions: [],
      coreServices: [],
      ownerUserId: null,
      rankrocketSiteKey: "tristate-hvac",
      gbpLocationName: null,
    });
  });

  it("rejects with a 400 AppError and does not call rankrocket_sites_write when no client's domain matches", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClientStoreList.mockResolvedValue([
      client({ id: 1, name: "Overhead Door Joliet", primaryDomain: "overheaddoorjoliet.com" }),
    ]);

    await expect(
      upsertSite("add", "tristate-hvac", { baseUrl: "https://tristate-hvac.com", authUser: "a", appPassword: "p" })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      upsertSite("add", "tristate-hvac", { baseUrl: "https://tristate-hvac.com", authUser: "a", appPassword: "p" })
    ).rejects.toMatchObject({ statusCode: 400, code: "NO_MATCHING_CLIENT" });
    expect(mockConnectMcpClient).not.toHaveBeenCalled();
    expect(mockClientStoreUpdate).not.toHaveBeenCalled();
  });

  it("rejects with a 400 AppError when more than one client shares the same domain", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClientStoreList.mockResolvedValue([
      client({ id: 1, name: "A", primaryDomain: "tristate-hvac.com" }),
      client({ id: 2, name: "B", primaryDomain: "www.tristate-hvac.com" }),
    ]);

    await expect(
      upsertSite("add", "tristate-hvac", { baseUrl: "https://tristate-hvac.com", authUser: "a", appPassword: "p" })
    ).rejects.toMatchObject({ statusCode: 400, code: "AMBIGUOUS_CLIENT_MATCH" });
    expect(mockConnectMcpClient).not.toHaveBeenCalled();
  });

  it("on update, clears the key from a previously-mapped different client and sets it on the newly matched one", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const clientA = client({ id: 1, name: "Client A", primaryDomain: "old-domain.com", rankrocketSiteKey: "site-x" });
    const clientB = client({ id: 2, name: "Client B", primaryDomain: "new-domain.com" });
    mockClientStoreList.mockResolvedValue([clientA, clientB]);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await upsertSite("update", "site-x", { baseUrl: "https://new-domain.com", authUser: "a", appPassword: "p" });

    expect(mockClientStoreUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ rankrocketSiteKey: null }));
    expect(mockClientStoreUpdate).toHaveBeenCalledWith(2, expect.objectContaining({ rankrocketSiteKey: "site-x" }));
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

  it("clears rankrocketSiteKey on whichever client currently has this key mapped", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    const mapped = client({ id: 7, name: "Mapped Client", primaryDomain: "tristate-hvac.com", rankrocketSiteKey: "tristate-hvac" });
    mockClientStoreList.mockResolvedValue([mapped]);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await deleteSite("tristate-hvac");

    expect(mockClientStoreUpdate).toHaveBeenCalledWith(7, expect.objectContaining({ rankrocketSiteKey: null }));
  });

  it("does not call clientStore.update when no client currently has this key mapped", async () => {
    mockGetRankRocketMcpConfig.mockReturnValue(CONFIG);
    mockClientStoreList.mockResolvedValue([client({ id: 1, rankrocketSiteKey: null })]);
    mockClient({ isError: false, content: JSON.stringify({ success: true }) });

    await deleteSite("tristate-hvac");

    expect(mockClientStoreUpdate).not.toHaveBeenCalled();
  });
});
