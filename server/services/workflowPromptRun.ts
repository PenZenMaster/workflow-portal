/*
 * Module/Script Name: workflowPromptRun.ts
 * Path: server/services/workflowPromptRun.ts
 *
 * Description:
 * Runs a portal workflow's prompt in-app via the RankRocket MCP connector
 * (Phase 3, read-only slice): fills the workflow prompt's <PASTE> tokens
 * from user-supplied input values, strips any lines whose tokens were left
 * unfilled, and sends the result to the dedicated RankRocket MCP adapter -
 * an AnthropicAdapter instance that calls rankrocket-mcp's read-only tools
 * server-side via Anthropic's MCP connector. No CSV involved, unlike
 * workflowFileRun.ts, whose <PASTE>-filling utilities this reuses.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-15
 * Comments:
 * - v1.00 Initial implementation
 */

import type { RawResponse } from "../adapters/types";
import { getRankRocketMcpAdapter } from "../adapters/registry";
import { AppError } from "../errors";
import { fillPromptTokens, stripUnfilledTokenLines } from "./workflowFileRun";

export async function runWorkflowPrompt(
  workflowPrompt: string,
  inputValues: string[] = []
): Promise<RawResponse> {
  const adapter = getRankRocketMcpAdapter();
  if (!adapter) {
    throw new AppError(
      503,
      "RankRocket MCP is not configured (missing ANTHROPIC_API_KEY or RANKROCKET_MCP_TOKEN)",
      "RANKROCKET_MCP_NOT_CONFIGURED"
    );
  }
  const prompt = stripUnfilledTokenLines(fillPromptTokens(workflowPrompt, inputValues));
  return adapter.run(prompt);
}
