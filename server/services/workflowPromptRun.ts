/*
 * Module/Script Name: workflowPromptRun.ts
 * Path: server/services/workflowPromptRun.ts
 *
 * Description:
 * Runs a portal workflow's prompt in-app (Phase 3 v2, read-only slice):
 * fills the workflow prompt's <PASTE> tokens from user-supplied input
 * values, then runs it against RankRocket-MCP's read-only tools via
 * runRankRocketReadOnlyPrompt. Replaces the Phase-3-v1 approach (Anthropic's
 * server-side MCP connector via a dedicated AnthropicAdapter instance), which
 * was verified in production not to work against rankrocket-mcp's plain
 * bearer-token (non-OAuth) auth. No CSV involved, unlike workflowFileRun.ts,
 * whose <PASTE>-filling utilities this reuses.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Initial implementation (Phase 3 v1, AnthropicAdapter + MCP connector)
 * - v2.00 Phase 3 v2: workflow-portal's own MCP client + hand-rolled tool loop
 * - v2.01 Connect/filter/run/close sequence extracted to
 *         server/mcp/rankrocketToolRun.ts so the Lights-Out SEO Factory's
 *         planning.ranking-growth-plan cell can reuse it. No behavior change.
 */

import type { RawResponse } from "../adapters/types";
import { runRankRocketReadOnlyPrompt } from "../mcp/rankrocketToolRun";
import { fillPromptTokens, stripUnfilledTokenLines } from "./workflowFileRun";

export async function runWorkflowPrompt(
  workflowPrompt: string,
  inputValues: string[] = []
): Promise<RawResponse> {
  const prompt = stripUnfilledTokenLines(fillPromptTokens(workflowPrompt, inputValues));
  return runRankRocketReadOnlyPrompt(prompt);
}
