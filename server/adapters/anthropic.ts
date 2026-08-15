import type { PlatformAdapter, RawResponse, RunOptions } from "./types";
import { AdapterTimeoutError } from "./types";
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

// Anthropic's MCP connector (beta): lets Claude call tools on a remote MCP
// server server-side, no client-side agent loop needed. Only set on adapter
// instances built specifically to reach a given MCP server (e.g.
// getRankRocketMcpAdapter()) - every other AnthropicAdapter instance is
// unaffected.
export interface McpConnectorConfig {
  url: string;
  token: string;
  serverName: string;
}

const MCP_BETA_HEADER = "mcp-client-2025-11-20";

export class AnthropicAdapter implements PlatformAdapter {
  readonly id = "anthropic";
  readonly capabilities = REGEX_CITATION_CAPABILITIES;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxTokens: number;
  private readonly mcp?: McpConnectorConfig;

  constructor(
    apiKey: string,
    opts: { model?: string; timeoutMs?: number; retryDelayMs?: number; maxTokens?: number; mcp?: McpConnectorConfig } = {}
  ) {
    this.apiKey = apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = resolveTimeoutMs(opts.timeoutMs);
    this.retryDelayMs = opts.retryDelayMs ?? 1_000;
    this.maxTokens = resolveMaxOutputTokens(opts.maxTokens);
    this.mcp = opts.mcp;
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<RawResponse> {
    if (!this.apiKey) throw new Error("Anthropic API key is required");

    const systemPrompt = opts.geo
      ? `You are a helpful assistant. Focus on results relevant to ${opts.geo}.`
      : "You are a helpful assistant.";

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    };
    if (this.mcp) {
      body.mcp_servers = [
        { type: "url", url: this.mcp.url, name: this.mcp.serverName, authorization_token: this.mcp.token },
      ];
      body.tools = [{ type: "mcp_toolset", mcp_server_name: this.mcp.serverName }];
    }

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
            ...(this.mcp ? { "anthropic-beta": MCP_BETA_HEADER } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as AnthropicResponse;
          // The last text block, not the first: with MCP tool use Claude
          // can legitimately emit a preamble text block before/between
          // tool calls, and the final synthesized answer is always last.
          const text = data.content?.filter((c) => c.type === "text").pop()?.text ?? "";
          return {
            text,
            summaryBlock: null,
            citations: extractUrlCitations(text),
            requestedModel: this.model,
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
          throw new AdapterTimeoutError(`Anthropic request timed out after ${this.timeoutMs}ms`);
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
