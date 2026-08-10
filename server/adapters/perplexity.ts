/*
 * Module/Script Name: perplexity.ts
 * Path: server/adapters/perplexity.ts
 *
 * Description:
 * Perplexity Sonar API adapter. Retries on 429/5xx up to 3 times with
 * exponential backoff. Extracts ordered citation URLs natively provided
 * by Sonar. Does not retry on 4xx client errors.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 * - v1.01 issue #2 F3: timeout no longer retries (avoids re-billing an
 *   already-sent prompt); timeout configurable via LLM_TIMEOUT_MS
 */

import type { PlatformAdapter, RawResponse, RunOptions, CitationRef, AdapterCapabilities } from "./types";
import { extractOpenAiUsage, resolveMaxOutputTokens, resolveTimeoutMs } from "./openaiCompatible";
import { logger } from "../logger";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MODEL = "sonar";
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

// issue #3 Epic 1 slice 1: the one platform with a native, ordered,
// structured citations field this adapter actually reads (data.citations
// below) - every other adapter's "citations" are regexed out of free text.
export const PERPLEXITY_CAPABILITIES: AdapterCapabilities = {
  citationSupport: true,
  orderedCitationSupport: true,
  webSearchGrounding: true,
  modelSelection: true,
  temperatureControl: false,
  locationContext: true,
  citationExtractionMethod: "native_structured",
};

interface PerplexityAdapterOptions {
  model?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxTokens?: number;
}

interface PerplexityApiResponse {
  id: string;
  model: string;
  choices: Array<{ message: { content: string } }>;
  citations?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class PerplexityAdapter implements PlatformAdapter {
  readonly id = "perplexity";
  readonly capabilities = PERPLEXITY_CAPABILITIES;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxTokens: number;

  constructor(apiKey: string, opts: PerplexityAdapterOptions = {}) {
    this.apiKey = apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = resolveTimeoutMs(opts.timeoutMs);
    this.retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.maxTokens = resolveMaxOutputTokens(opts.maxTokens);
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<RawResponse> {
    if (!this.apiKey) {
      throw new Error("Perplexity API key is required");
    }

    const systemPrompt = opts.geo
      ? `You are a helpful assistant. Focus on results relevant to ${opts.geo}.`
      : "You are a helpful assistant.";

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
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
        const response = await fetch(PERPLEXITY_API_URL, {
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
          const data = (await response.json()) as PerplexityApiResponse;
          const text = data.choices?.[0]?.message?.content ?? "";
          const citations: CitationRef[] = (data.citations ?? []).map(
            (url, idx) => ({ url, position: idx + 1 })
          );

          return {
            text,
            summaryBlock: null,
            citations,
            modelVariant: data.model ?? this.model,
            latencyMs: Date.now() - startMs,
            rawPayload: data,
            usage: extractOpenAiUsage(data.usage),
          };
        }

        // Do not retry on 4xx client errors (except 429 rate limit).
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errText = await response.text();
          throw new Error(`Perplexity API error ${response.status}: ${errText}`);
        }

        lastError = new Error(`Perplexity API returned ${response.status}`);
        logger.warn("perplexity request failed — will retry", {
          attempt,
          status: response.status,
        });
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          // F3: don't retry a timeout - the provider may already have
          // billed the aborted request. Fail fast instead, same as 4xx.
          throw new Error(`Perplexity request timed out after ${this.timeoutMs}ms`);
        } else if (err instanceof Error && err.message.includes("Perplexity API error")) {
          throw err; // 4xx — propagate immediately
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
        logger.warn("perplexity request error — will retry", {
          attempt,
          error: lastError.message,
        });
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) =>
          setTimeout(r, this.retryDelayMs * Math.pow(2, attempt - 1))
        );
      }
    }

    throw lastError;
  }
}
