import type { PlatformAdapter, RawResponse, RunOptions } from "./types";
import { AdapterTimeoutError } from "./types";
import { extractUrlCitations, resolveMaxOutputTokens, resolveTimeoutMs, REGEX_CITATION_CAPABILITIES } from "./openaiCompatible";
import { logger } from "../logger";

const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_RETRIES = 3;

interface GeminiResponse {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  modelVersion?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function extractGeminiUsage(meta: GeminiResponse["usageMetadata"]): { inputTokens: number; outputTokens: number } | null {
  if (typeof meta?.promptTokenCount !== "number" || typeof meta?.candidatesTokenCount !== "number") return null;
  return { inputTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount };
}

export class GeminiAdapter implements PlatformAdapter {
  readonly id = "gemini";
  readonly capabilities = REGEX_CITATION_CAPABILITIES;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxTokens: number;

  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number; maxTokens?: number } = {}) {
    this.apiKey = apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = resolveTimeoutMs(opts.timeoutMs);
    this.retryDelayMs = opts.retryDelayMs ?? 1_000;
    this.maxTokens = resolveMaxOutputTokens(opts.maxTokens);
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<RawResponse> {
    if (!this.apiKey) throw new Error("Gemini API key is required");

    const fullPrompt = opts.geo ? `[Focus on results relevant to ${opts.geo}]\n\n${prompt}` : prompt;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: this.maxTokens },
    };

    let lastError: Error = new Error("Unknown error");
    const startMs = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as GeminiResponse;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          return {
            text,
            summaryBlock: null,
            citations: extractUrlCitations(text),
            requestedModel: this.model,
            modelVariant: data.modelVersion ?? this.model,
            latencyMs: Date.now() - startMs,
            rawPayload: data,
            usage: extractGeminiUsage(data.usageMetadata),
          };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
        }

        lastError = new Error(`Gemini API returned ${response.status}`);
        logger.warn("gemini request failed — will retry", { attempt, status: response.status });
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          // F3: don't retry a timeout - the provider may already have
          // billed the aborted request. Fail fast instead.
          throw new AdapterTimeoutError(`Gemini request timed out after ${this.timeoutMs}ms`);
        } else if (err instanceof Error && err.message.includes("Gemini API error")) {
          throw err;
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * Math.pow(2, attempt - 1)));
      }
    }

    throw lastError;
  }
}
