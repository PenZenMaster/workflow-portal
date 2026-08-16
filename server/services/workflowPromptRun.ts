/*
 * Module/Script Name: workflowPromptRun.ts
 * Path: server/services/workflowPromptRun.ts
 *
 * Description:
 * Runs a portal workflow's prompt in-app (Phase 3 v2, read-only slice):
 * fills the workflow prompt's <PASTE> tokens from user-supplied input
 * values, then connects workflow-portal's own MCP client to rankrocket-mcp,
 * lists its tools, filters them down to the read-only allowlist, and drives
 * a hand-rolled Anthropic tool-call loop so Claude can call those tools
 * directly. Replaces the Phase-3-v1 approach (Anthropic's server-side MCP
 * connector via a dedicated AnthropicAdapter instance), which was verified
 * in production not to work against rankrocket-mcp's plain bearer-token
 * (non-OAuth) auth. No CSV involved, unlike workflowFileRun.ts, whose
 * <PASTE>-filling utilities this reuses.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation (Phase 3 v1, AnthropicAdapter + MCP connector)
 * - v2.00 Phase 3 v2: workflow-portal's own MCP client + hand-rolled tool loop
 */

import type { RawResponse } from "../adapters/types";
import { getRankRocketMcpConfig } from "../adapters/registry";
import { runAnthropicWithTools } from "../adapters/anthropicToolLoop";
import { connectMcpClient } from "../mcp/mcpClient";
import { filterRankRocketReadOnlyTools, mcpToolToAnthropicTool } from "../mcp/toolBridge";
import { AppError } from "../errors";
import { fillPromptTokens, stripUnfilledTokenLines } from "./workflowFileRun";

export async function runWorkflowPrompt(
  workflowPrompt: string,
  inputValues: string[] = []
): Promise<RawResponse> {
  const config = getRankRocketMcpConfig();
  if (!config) {
    throw new AppError(
      503,
      "RankRocket MCP is not configured (missing ANTHROPIC_API_KEY or RANKROCKET_MCP_TOKEN)",
      "RANKROCKET_MCP_NOT_CONFIGURED"
    );
  }
  const prompt = stripUnfilledTokenLines(fillPromptTokens(workflowPrompt, inputValues));

  const mcpClient = await connectMcpClient(config.url, config.token);
  try {
    const allTools = await mcpClient.listTools();
    const tools = filterRankRocketReadOnlyTools(allTools).map(mcpToolToAnthropicTool);

    return await runAnthropicWithTools(
      config.apiKey,
      config.model,
      prompt,
      tools,
      (name, input) => mcpClient.callTool(name, input)
    );
  } finally {
    await mcpClient.close();
  }
}
