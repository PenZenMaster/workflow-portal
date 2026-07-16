/*
 * Module/Script Name: openaiCompatible.ts
 * Path: server/adapters/openaiCompatible.ts
 *
 * Description:
 * Shared fetch/retry/citation-extract logic for OpenAI-compatible APIs.
 * Used by OpenAI, Groq (Llama), Mistral, and DeepSeek adapters.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Multi-LLM sprint
 */

import type { PlatformAdapter, RawResponse, RunOptions, CitationRef, TokenUsage } from "./types";
import { logger } from "../logger";

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;

const URL_REGEX = /https?:\/\/[^\s\)\]\>"']+/g;

export function extractUrlCitations(text: string): CitationRef[] {
  const matches = text.match(URL_REGEX) ?? [];
  return Array.from(new Set(matches)).map((url, idx) => ({ url, position: idx + 1 }));
}

// OpenAI-style usage block ({ prompt_tokens, completion_tokens }) — also
// returned by Groq, Mistral, DeepSeek, and Perplexity.
export function extractOpenAiUsage(usage: unknown): TokenUsage | null {
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown };
  if (typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number") return null;
  return { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens };
}

interface OpenAICompatibleOptions {
  model?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
}

interface OpenAIResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleAdapter implements PlatformAdapter {
  readonly id: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    id: string,
    apiKey: string,
    baseUrl: string,
    defaultModel: string,
    opts: OpenAICompatibleOptions = {}
  ) {
    this.id = id;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = opts.model ?? defaultModel;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<RawResponse> {
    if (!this.apiKey) {
      throw new Error(`${this.id} API key is required`);
    }

    const systemPrompt = opts.geo
      ? `You are a helpful assistant. Focus on results relevant to ${opts.geo}.`
      : "You are a helpful assistant.";

    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    };

    let lastError: Error = new Error("Unknown error");
    const startMs = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as OpenAIResponse;
          const text = data.choices?.[0]?.message?.content ?? "";
          return {
            text,
            summaryBlock: null,
            citations: extractUrlCitations(text),
            modelVariant: data.model ?? this.model,
            latencyMs: Date.now() - startMs,
            rawPayload: data,
            usage: extractOpenAiUsage(data.usage),
          };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errText = await response.text();
          throw new Error(`${this.id} API error ${response.status}: ${errText}`);
        }

        lastError = new Error(`${this.id} API returned ${response.status}`);
        logger.warn(`${this.id} request failed — will retry`, { attempt, status: response.status });
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          lastError = new Error(`${this.id} request timed out after ${this.timeoutMs}ms`);
        } else if (err instanceof Error && err.message.includes(`${this.id} API error`)) {
          throw err;
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
        logger.warn(`${this.id} request error — will retry`, { attempt, error: lastError.message });
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * Math.pow(2, attempt - 1)));
      }
    }

    throw lastError;
  }
}
