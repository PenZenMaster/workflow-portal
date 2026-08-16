/*
 * Module/Script Name: toolBridge.ts
 * Path: server/mcp/toolBridge.ts
 *
 * Description:
 * Converts MCP tool definitions into Anthropic Messages API tool
 * definitions, plus the RankRocket read-only-tool safety allowlist.
 * With Anthropic's MCP connector no longer in the picture, workflow-
 * portal itself owns what gets listed as tools to Claude - filtering
 * write tools out here is now the safety boundary that used to be the
 * connector's mcp_toolset allow/denylist config.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import type { McpTool } from "./mcpClient";
import type { AnthropicToolDef } from "../adapters/anthropicToolLoop";

export function mcpToolToAnthropicTool(tool: McpTool): AnthropicToolDef {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

// Explicit allowlist, not a denylist - a tool this repo hasn't reviewed
// (including any new tool rankrocket-mcp adds later) is excluded by
// default rather than silently exposed to Claude.
export const RANKROCKET_READONLY_TOOLS = new Set([
  "rankrocket_status",
  "rankrocket_content_audit",
  "rankrocket_action_dry_run",
  "rankrocket_seo_meta",
  "rankrocket_redirects",
  "rankrocket_snippets",
  "rankrocket_perf_cache",
  "rankrocket_images",
  "rankrocket_elementor",
]);

export function filterRankRocketReadOnlyTools(tools: McpTool[]): McpTool[] {
  return tools.filter((t) => RANKROCKET_READONLY_TOOLS.has(t.name));
}
