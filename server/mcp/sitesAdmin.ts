/*
 * Module/Script Name: sitesAdmin.ts
 * Path: server/mcp/sitesAdmin.ts
 *
 * Description:
 * RankRocket Site Insights admin CRUD, Part B: thin wrappers calling
 * rankrocket-mcp's rankrocket_sites_detail (read) and
 * rankrocket_sites_write (add/update/delete) tools directly via
 * workflow-portal's own MCP client (server/mcp/mcpClient.ts) - same
 * connect-call-close pattern as sitesCache.ts's boot-time cache refresh.
 * Deliberately outside the Claude tool loop and never added to
 * RANKROCKET_READONLY_TOOLS/any Claude-facing allowlist
 * (server/mcp/toolBridge.ts) - these are called only from the admin
 * routes (server/routes/rankrocketAdmin.ts), triggered by an
 * authenticated human's form submission, never by an LLM's own tool
 * selection. Unlike sitesCache.ts's fire-and-forget degrade-to-empty
 * behavior, every function here throws on failure so the admin route
 * surfaces a real error instead of silently no-op'ing.
 *
 * workflow-portal never persists the WordPress Application Password at
 * rest - these functions pass it straight through to rankrocket-mcp in
 * one request/response cycle and never write it to this app's own
 * database. Never log the raw config/credentials passed to upsertSite.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part B
 */

import { getRankRocketMcpConfig } from "../adapters/registry";
import { connectMcpClient, type McpClientSource } from "./mcpClient";
import { refreshRankRocketSitesCache } from "./sitesCache";

export interface SiteDetail {
  key: string;
  baseUrl: string;
  authUser: string;
}

export interface SiteCredentials {
  baseUrl: string;
  authUser: string;
  appPassword: string;
}

async function withClient<T>(fn: (client: McpClientSource) => Promise<T>): Promise<T> {
  const config = getRankRocketMcpConfig();
  if (!config) throw new Error("RankRocket MCP is not configured");
  const client = await connectMcpClient(config.url, config.token);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export async function listSitesDetail(): Promise<SiteDetail[]> {
  return withClient(async (client) => {
    const result = await client.callTool("rankrocket_sites_detail", {});
    if (result.isError) throw new Error(result.content);
    const parsed = JSON.parse(result.content) as { sites?: SiteDetail[] };
    return Array.isArray(parsed.sites) ? parsed.sites : [];
  });
}

export async function upsertSite(
  operation: "add" | "update",
  key: string,
  credentials: SiteCredentials
): Promise<void> {
  await withClient(async (client) => {
    const result = await client.callTool("rankrocket_sites_write", {
      operation,
      key,
      ...credentials,
      confirm: true,
    });
    if (result.isError) throw new Error(result.content);
  });
  await refreshRankRocketSitesCache();
}

export async function deleteSite(key: string): Promise<void> {
  await withClient(async (client) => {
    const result = await client.callTool("rankrocket_sites_write", {
      operation: "delete",
      key,
      confirm: true,
    });
    if (result.isError) throw new Error(result.content);
  });
  await refreshRankRocketSitesCache();
}
