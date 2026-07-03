/*
 * Module/Script Name: workflowFileRun.ts
 * Path: server/services/workflowFileRun.ts
 *
 * Description:
 * Runs a portal workflow against an uploaded CSV file: fills the workflow
 * prompt's <PASTE> tokens from user-supplied input values, strips any lines
 * whose tokens were left unfilled, embeds the full CSV text, and sends the
 * result to the first configured LLM adapter (same preference order as
 * prompt generation). The file content is never persisted - it exists only
 * for the duration of the request.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial implementation (workflow CSV upload feature, v1.20.0)
 * - v1.01 B-21: inputValues fill <PASTE> tokens; unfilled token lines stripped
 */

import type { RawResponse } from "../adapters/types";
import { pickGenerationAdapter } from "./promptGenerator";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;

const PASTE_TOKEN = "<PASTE>";

export function countCsvDataRows(csvText: string): number {
  const nonEmptyLines = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  return Math.max(0, nonEmptyLines.length - 1);
}

/**
 * Fill <PASTE> tokens in order from values. A missing or blank value leaves
 * its token in place so stripUnfilledTokenLines can drop the whole line.
 */
export function fillPromptTokens(template: string, values: string[]): string {
  let i = 0;
  return template.replace(/<PASTE>/g, () => {
    const value = values[i++];
    return value !== undefined && value.trim().length > 0 ? value : PASTE_TOKEN;
  });
}

/** Remove every line that still contains an unfilled <PASTE> token. */
export function stripUnfilledTokenLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.includes(PASTE_TOKEN))
    .join("\n");
}

export function buildCsvRunPrompt(
  workflowPrompt: string,
  csvText: string,
  filename?: string,
  inputValues: string[] = []
): string {
  const preparedPrompt = stripUnfilledTokenLines(
    fillPromptTokens(workflowPrompt, inputValues)
  );
  const rows = countCsvDataRows(csvText);
  const source = filename ? ` from "${filename}"` : "";
  return [
    preparedPrompt,
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
  filename?: string,
  inputValues: string[] = []
): Promise<RawResponse> {
  const adapter = pickGenerationAdapter();
  return adapter.run(buildCsvRunPrompt(workflowPrompt, csvText, filename, inputValues));
}
