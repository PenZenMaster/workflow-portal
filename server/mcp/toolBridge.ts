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
  "rankrocket_elementor_read",
]);

export function filterRankRocketReadOnlyTools(tools: McpTool[]): McpTool[] {
  return tools.filter((t) => RANKROCKET_READONLY_TOOLS.has(t.name));
}

// Every other write tool in rankrocket-mcp is deliberately excluded from
// Claude's own tool loop (see RANKROCKET_READONLY_TOOLS above) - Claude only
// ever reads data and produces a report a human acts on. This is the one
// narrow, deliberate exception: the Location Page Builder workflow card is
// allowed to call rankrocket_pages_write and rankrocket_elementor_write
// directly, because the pages (and their layout) it creates are always
// drafts (never published) and reversible via the plugin's own rollback
// (trashes the page, not a hard delete). rankrocket_elementor_write was
// missed when the Elementor-styling fix first shipped (v1.107.0) - the
// prompt already instructed the model to call it, but it wasn't in this
// allowlist, so every real run could validate a styled layout via dry-run
// but never had permission to apply it; confirmed live against
// trevoraspiranti.com (page 4572, Farmington Hills) before this fix. Used
// only by server/mcp/rankrocketToolRun.ts's runRankRocketPageBuilderPrompt -
// every other in-app run (including the growth-plan card) keeps using
// RANKROCKET_READONLY_TOOLS/filterRankRocketReadOnlyTools unchanged.
export const RANKROCKET_PAGE_BUILDER_TOOLS = new Set([
  ...Array.from(RANKROCKET_READONLY_TOOLS),
  "rankrocket_pages",
  "rankrocket_pages_write",
  "rankrocket_elementor_write",
]);

export function filterRankRocketPageBuilderTools(tools: McpTool[]): McpTool[] {
  return tools.filter((t) => RANKROCKET_PAGE_BUILDER_TOOLS.has(t.name));
}
