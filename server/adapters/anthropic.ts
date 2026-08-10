import type { PlatformAdapter, RawResponse, RunOptions } from "./types";
import { extractUrlCitations, resolveMaxOutputTokens, resolveTimeoutMs, REGEX_CITATION_CAPABILITIES } from "./openaiCompatible";
import { logger } from "../logger";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-5";
const MAX_RETRIES = 3;

interface AnthropicResponse {
  model: string;
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function extractAnthropicUsage(usage: AnthropicResponse["usage"]): { inputTokens: number; outputTokens: number } | null {
  if (typeof usage?.input_tokens !== "number" || typeof usage?.output_tokens !== "number") return null;
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

export class AnthropicAdapter implements PlatformAdapter {
  readonly id = "anthropic";
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
    if (!this.apiKey) throw new Error("Anthropic API key is required");

    const systemPrompt = opts.geo
      ? `You are a helpful assistant. Focus on results relevant to ${opts.geo}.`
      : "You are a helpful assistant.";

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    };

    let lastError: Error = new Error("Unknown error");
    const startMs = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as AnthropicResponse;
          const text = data.content?.find((c) => c.type === "text")?.text ?? "";
          return {
            text,
            summaryBlock: null,
            citations: extractUrlCitations(text),
            modelVariant: data.model ?? this.model,
            latencyMs: Date.now() - startMs,
            rawPayload: data,
            usage: extractAnthropicUsage(data.usage),
          };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
        }

        lastError = new Error(`Anthropic API returned ${response.status}`);
        logger.warn("anthropic request failed — will retry", { attempt, status: response.status });
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          // F3: don't retry a timeout - the provider may already have
          // billed the aborted request. Fail fast instead.
          throw new Error(`Anthropic request timed out after ${this.timeoutMs}ms`);
        } else if (err instanceof Error && err.message.includes("Anthropic API error")) {
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
