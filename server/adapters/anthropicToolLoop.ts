/*
 * Module/Script Name: anthropicToolLoop.ts
 * Path: server/adapters/anthropicToolLoop.ts
 *
 * Description:
 * Hand-rolled Claude tool-call loop, purpose-built for driving an MCP
 * client (server/mcp/mcpClient.ts) through Anthropic's Messages API -
 * replaces Anthropic's server-side MCP connector, which was verified in
 * production not to work against a non-OAuth (static-bearer) MCP server.
 * Not a PlatformAdapter (server/adapters/types.ts) - that interface is
 * text-in/text-out and used generically elsewhere; this is a distinct
 * shape (prompt + tools + a tool-executor callback in, RawResponse out).
 * Mirrors anthropic.ts's retry/timeout precedent rather than sharing code
 * with it, to keep both files independently simple.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import type { RawResponse } from "./types";
import { AdapterTimeoutError } from "./types";
import { resolveMaxOutputTokens, resolveTimeoutMs } from "./openaiCompatible";
import { logger } from "../logger";
import type { McpToolResult } from "../mcp/mcpClient";

const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_RETRIES = 3;
const DEFAULT_MAX_ITERATIONS = 8;

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: unknown;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessage {
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function postToAnthropic(
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  retryDelayMs: number
): Promise<AnthropicMessage> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        return (await response.json()) as AnthropicMessage;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
      }

      lastError = new Error(`Anthropic API returned ${response.status}`);
      logger.warn("anthropic tool loop request failed — will retry", { attempt, status: response.status });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new AdapterTimeoutError(`Anthropic tool loop request timed out after ${timeoutMs}ms`);
      } else if (err instanceof Error && err.message.includes("Anthropic API error")) {
        throw err;
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt - 1)));
    }
  }

  throw lastError;
}

function lastText(content: AnthropicContentBlock[]): string {
  const textBlocks = content.filter((c) => c.type === "text" && typeof c.text === "string");
  return (textBlocks.pop()?.text as string | undefined) ?? "";
}

export async function runAnthropicWithTools(
  apiKey: string,
  model: string,
  prompt: string,
  tools: AnthropicToolDef[],
  executeTool: (name: string, input: unknown) => Promise<McpToolResult>,
  opts: { maxTokens?: number; timeoutMs?: number; retryDelayMs?: number; maxIterations?: number } = {}
): Promise<RawResponse> {
  if (!apiKey) throw new Error("Anthropic API key is required");

  const maxTokens = resolveMaxOutputTokens(opts.maxTokens);
  const timeoutMs = resolveTimeoutMs(opts.timeoutMs);
  const retryDelayMs = opts.retryDelayMs ?? 1_000;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: prompt },
  ];

  const startMs = Date.now();
  let last: AnthropicMessage | null = null;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    last = await postToAnthropic(
      apiKey,
      { model, max_tokens: maxTokens, tools, messages },
      timeoutMs,
      retryDelayMs
    );

    if (last.stop_reason !== "tool_use") break;

    const toolUseBlocks = last.content.filter((c) => c.type === "tool_use");
    messages.push({ role: "assistant", content: last.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        try {
          const result = await executeTool(block.name as string, block.input);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
            is_error: result.isError,
          };
        } catch (err) {
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  const content = last?.content ?? [];
  return {
    text: lastText(content),
    summaryBlock: null,
    citations: [],
    requestedModel: model,
    modelVariant: last?.model ?? model,
    latencyMs: Date.now() - startMs,
    rawPayload: last,
    usage:
      typeof last?.usage?.input_tokens === "number" && typeof last?.usage?.output_tokens === "number"
        ? { inputTokens: last.usage.input_tokens, outputTokens: last.usage.output_tokens }
        : null,
  };
}
