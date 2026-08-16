/*
 * Module/Script Name: sitesCache.ts
 * Path: server/mcp/sitesCache.ts
 *
 * Description:
 * In-memory cache of the site keys configured on rankrocket-mcp, refreshed
 * once at app startup (fire-and-forget - see server/index.ts) by calling
 * that server's rankrocket_sites tool directly through workflow-portal's
 * own MCP client. Deliberately outside the Claude tool loop and not on the
 * RANKROCKET_READONLY_TOOLS allowlist (server/mcp/toolBridge.ts) - this is
 * config data for the "RankRocket Site Insights" card's site dropdown, not
 * something Claude calls. A missing config or unreachable server degrades
 * to an empty list rather than blocking app boot.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { getRankRocketMcpConfig } from "../adapters/registry";
import { connectMcpClient, type McpClientSource } from "./mcpClient";
import { logger } from "../logger";

let cachedSites: string[] = [];

export function getCachedRankRocketSites(): string[] {
  return cachedSites;
}

export async function refreshRankRocketSitesCache(): Promise<void> {
  const config = getRankRocketMcpConfig();
  if (!config) {
    cachedSites = [];
    return;
  }

  let client: McpClientSource | undefined;
  try {
    client = await connectMcpClient(config.url, config.token);
    const result = await client.callTool("rankrocket_sites", {});
    if (result.isError) {
      throw new Error(result.content);
    }
    const parsed = JSON.parse(result.content) as { sites?: unknown };
    cachedSites = Array.isArray(parsed.sites)
      ? parsed.sites.filter((s): s is string => typeof s === "string")
      : [];
  } catch (err) {
    cachedSites = [];
    logger.warn("rankrocket sites cache refresh failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await client?.close();
  }
}
