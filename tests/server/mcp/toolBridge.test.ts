/*
 * Module/Script Name: toolBridge.test.ts
 * Path: tests/server/mcp/toolBridge.test.ts
 *
 * Description:
 * Tests for the MCP-tool -> Anthropic-tool schema bridge and the
 * RankRocket read-only tool allowlist. The allowlist is the safety
 * boundary that used to be Anthropic MCP connector's mcp_toolset
 * allow/denylist config - now workflow-portal's own responsibility since
 * it lists tools directly from the MCP server.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  mcpToolToAnthropicTool,
  filterRankRocketReadOnlyTools,
  filterRankRocketPageBuilderTools,
} from "../../../server/mcp/toolBridge";
import type { McpTool } from "../../../server/mcp/mcpClient";

describe("mcpToolToAnthropicTool", () => {
  it("maps an MCP tool to Anthropic's tool definition shape", () => {
    const mcpTool: McpTool = {
      name: "rankrocket_status",
      description: "Get plugin status",
      inputSchema: { type: "object", properties: { site: { type: "string" } } },
    };

    expect(mcpToolToAnthropicTool(mcpTool)).toEqual({
      name: "rankrocket_status",
      description: "Get plugin status",
      input_schema: { type: "object", properties: { site: { type: "string" } } },
    });
  });
});

describe("filterRankRocketReadOnlyTools", () => {
  it("keeps only the 9 known read-only tools", () => {
    const tools: McpTool[] = [
      { name: "rankrocket_status", description: "", inputSchema: {} },
      { name: "rankrocket_content_audit", description: "", inputSchema: {} },
      { name: "rankrocket_action_dry_run", description: "", inputSchema: {} },
      { name: "rankrocket_seo_meta", description: "", inputSchema: {} },
      { name: "rankrocket_redirects", description: "", inputSchema: {} },
      { name: "rankrocket_snippets", description: "", inputSchema: {} },
      { name: "rankrocket_perf_cache", description: "", inputSchema: {} },
      { name: "rankrocket_images", description: "", inputSchema: {} },
      { name: "rankrocket_elementor", description: "", inputSchema: {} },
    ];
    expect(filterRankRocketReadOnlyTools(tools)).toHaveLength(9);
  });

  it("drops every write tool even if the server advertises it", () => {
    const writeTools: McpTool[] = [
      { name: "rankrocket_action_execute", description: "", inputSchema: {} },
      { name: "rankrocket_action_rollback", description: "", inputSchema: {} },
      { name: "rankrocket_seo_meta_update", description: "", inputSchema: {} },
      { name: "rankrocket_redirects_write", description: "", inputSchema: {} },
      { name: "rankrocket_snippets_write", description: "", inputSchema: {} },
      { name: "rankrocket_perf_cache_write", description: "", inputSchema: {} },
      { name: "rankrocket_images_write", description: "", inputSchema: {} },
      { name: "rankrocket_elementor_write", description: "", inputSchema: {} },
    ];
    expect(filterRankRocketReadOnlyTools(writeTools)).toHaveLength(0);
  });

  it("drops unknown tool names defensively (allowlist, not denylist)", () => {
    const tools: McpTool[] = [
      { name: "rankrocket_status", description: "", inputSchema: {} },
      { name: "some_future_tool_not_yet_reviewed", description: "", inputSchema: {} },
    ];
    const filtered = filterRankRocketReadOnlyTools(tools);
    expect(filtered.map((t) => t.name)).toEqual(["rankrocket_status"]);
  });

  it("drops rankrocket_pages_write - it is only ever allowed via the page-builder allowlist", () => {
    const tools: McpTool[] = [
      { name: "rankrocket_status", description: "", inputSchema: {} },
      { name: "rankrocket_pages", description: "", inputSchema: {} },
      { name: "rankrocket_pages_write", description: "", inputSchema: {} },
    ];
    const filtered = filterRankRocketReadOnlyTools(tools);
    expect(filtered.map((t) => t.name)).toEqual(["rankrocket_status"]);
  });

  it("keeps rankrocket_elementor_read - read-only, same tier as rankrocket_elementor", () => {
    const tools: McpTool[] = [
      { name: "rankrocket_status", description: "", inputSchema: {} },
      { name: "rankrocket_elementor_read", description: "", inputSchema: {} },
    ];
    const filtered = filterRankRocketReadOnlyTools(tools);
    expect(filtered.map((t) => t.name).sort()).toEqual(
      ["rankrocket_elementor_read", "rankrocket_status"].sort()
    );
  });
});

describe("filterRankRocketPageBuilderTools", () => {
  it("keeps every read-only tool plus rankrocket_pages, rankrocket_pages_write, and rankrocket_elementor_write", () => {
    const tools: McpTool[] = [
      { name: "rankrocket_status", description: "", inputSchema: {} },
      { name: "rankrocket_elementor_read", description: "", inputSchema: {} },
      { name: "rankrocket_pages", description: "", inputSchema: {} },
      { name: "rankrocket_pages_write", description: "", inputSchema: {} },
      { name: "rankrocket_elementor_write", description: "", inputSchema: {} },
    ];
    const filtered = filterRankRocketPageBuilderTools(tools);
    expect(filtered.map((t) => t.name).sort()).toEqual(
      [
        "rankrocket_elementor_read",
        "rankrocket_elementor_write",
        "rankrocket_pages",
        "rankrocket_pages_write",
        "rankrocket_status",
      ].sort()
    );
  });

  it("still drops every other write tool (narrow exception, not a general write allowlist)", () => {
    const writeTools: McpTool[] = [
      { name: "rankrocket_action_execute", description: "", inputSchema: {} },
      { name: "rankrocket_redirects_write", description: "", inputSchema: {} },
      { name: "rankrocket_seo_meta_update", description: "", inputSchema: {} },
    ];
    expect(filterRankRocketPageBuilderTools(writeTools)).toHaveLength(0);
  });
});
