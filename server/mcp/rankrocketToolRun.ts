/*
 * Module/Script Name: rankrocketToolRun.ts
 * Path: server/mcp/rankrocketToolRun.ts
 *
 * Description:
 * Runs a prompt against RankRocket-MCP's read-only tools via Claude: connects
 * workflow-portal's own MCP client, lists rankrocket-mcp's tools, filters them
 * to the read-only allowlist, and drives the hand-rolled Anthropic tool-call
 * loop. Extracted from workflowPromptRun.ts (Phase 3 v2) so a second caller
 * (the Lights-Out SEO Factory's planning.ranking-growth-plan cell) can reuse
 * the exact same connect/filter/run/close sequence instead of duplicating it.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Extracted from workflowPromptRun.ts, no behavior change
 * - v1.01 Added isRankRocketMcpConfigured() for cheap dry-run config checks
 *         (no MCP connection, no model call) - first used by the
 *         planning.ranking-growth-plan factory cell.
 */

import type { McpTool } from "./mcpClient";
import type { RawResponse } from "../adapters/types";
import { getRankRocketMcpConfig } from "../adapters/registry";
import { runAnthropicWithTools } from "../adapters/anthropicToolLoop";
import { connectMcpClient } from "./mcpClient";
import {
  filterRankRocketReadOnlyTools,
  filterRankRocketPageBuilderTools,
  mcpToolToAnthropicTool,
} from "./toolBridge";
import { AppError } from "../errors";

export function isRankRocketMcpConfigured(): boolean {
  return getRankRocketMcpConfig() !== undefined;
}

async function runRankRocketPrompt(
  prompt: string,
  toolFilter: (tools: McpTool[]) => McpTool[],
  opts: { maxIterations?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<RawResponse> {
  const config = getRankRocketMcpConfig();
  if (!config) {
    throw new AppError(
      503,
      "RankRocket MCP is not configured (missing ANTHROPIC_API_KEY or RANKROCKET_MCP_TOKEN)",
      "RANKROCKET_MCP_NOT_CONFIGURED"
    );
  }

  const mcpClient = await connectMcpClient(config.url, config.token);
  try {
    const allTools = await mcpClient.listTools();
    const tools = toolFilter(allTools).map(mcpToolToAnthropicTool);

    const maxIterations = opts.maxIterations;
    const maxTokens = opts.maxTokens ?? config.maxTokens;
    const timeoutMs = opts.timeoutMs ?? config.timeoutMs;

    return await runAnthropicWithTools(
      config.apiKey,
      config.model,
      prompt,
      tools,
      (name, input) => mcpClient.callTool(name, input),
      {
        ...(maxIterations !== undefined && { maxIterations }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(timeoutMs !== undefined && { timeoutMs }),
      }
    );
  } finally {
    await mcpClient.close();
  }
}

export async function runRankRocketReadOnlyPrompt(
  prompt: string,
  opts: { maxIterations?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<RawResponse> {
  return runRankRocketPrompt(prompt, filterRankRocketReadOnlyTools, opts);
}

// The one workflow (Location Page Builder) where Claude's own tool loop is
// allowed to write to the live site directly - see RANKROCKET_PAGE_BUILDER_TOOLS
// (server/mcp/toolBridge.ts) for why this is safe: draft-only, never
// published, reversible via the plugin's own rollback.
export async function runRankRocketPageBuilderPrompt(
  prompt: string,
  opts: { maxIterations?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<RawResponse> {
  return runRankRocketPrompt(prompt, filterRankRocketPageBuilderTools, opts);
}
