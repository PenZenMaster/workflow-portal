/*
 * Module/Script Name: workflowFileRun.ts
 * Path: server/services/workflowFileRun.ts
 *
 * Description:
 * Runs a portal workflow against an uploaded CSV file: embeds the full CSV
 * text into the workflow's prompt and sends it to the first configured LLM
 * adapter (same preference order as prompt generation). The file content is
 * never persisted - it exists only for the duration of the request.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial implementation (workflow CSV upload feature, v1.20.0)
 */

import type { RawResponse } from "../adapters/types";
import { pickGenerationAdapter } from "./promptGenerator";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function countCsvDataRows(csvText: string): number {
  const nonEmptyLines = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  return Math.max(0, nonEmptyLines.length - 1);
}

export function buildCsvRunPrompt(
  workflowPrompt: string,
  csvText: string,
  filename?: string
): string {
  const rows = countCsvDataRows(csvText);
  const source = filename ? ` from "${filename}"` : "";
  return [
    workflowPrompt,
    "",
    "---",
    `CSV DATA${source} (${rows} data rows, full file follows):`,
    "",
    csvText,
  ].join("\n");
}

export async function runWorkflowWithCsv(
  workflowPrompt: string,
  csvText: string,
  filename?: string
): Promise<RawResponse> {
  const adapter = pickGenerationAdapter();
  return adapter.run(buildCsvRunPrompt(workflowPrompt, csvText, filename));
}
