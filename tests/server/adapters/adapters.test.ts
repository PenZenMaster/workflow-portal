/**
 * Tests for all non-Perplexity AI platform adapters.
 * Each adapter: success path, retry on 429, no retry on 4xx, missing key throws.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIAdapter } from "../../../server/adapters/openai";
import { AnthropicAdapter } from "../../../server/adapters/anthropic";
import { GeminiAdapter } from "../../../server/adapters/gemini";
import { GroqAdapter } from "../../../server/adapters/groq";
import { MistralAdapter } from "../../../server/adapters/mistral";
import { DeepSeekAdapter } from "../../../server/adapters/deepseek";
import { resolveTimeoutMs } from "../../../server/adapters/openaiCompatible";
import { AdapterTimeoutError } from "../../../server/adapters/types";

const OPENAI_BODY = {
  id: "chatcmpl-test",
  model: "gpt-4o",
  choices: [{ message: { content: "Acme SEO is the top agency. See https://acme.com for details." } }],
  usage: { prompt_tokens: 42, completion_tokens: 117, total_tokens: 159 },
};

const ANTHROPIC_BODY = {
  id: "msg_test",
  model: "claude-opus-4-5",
  content: [{ type: "text", text: "Acme SEO leads the market. Visit https://acme.com." }],
  usage: { input_tokens: 42, output_tokens: 117 },
};

const GEMINI_BODY = {
  candidates: [{
    content: { parts: [{ text: "Acme SEO is highly recommended. Check https://acme.com." }] },
  }],
  modelVersion: "gemini-2.0-flash",
  usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 117, totalTokenCount: 159 },
};

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const { status, body } = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
}

function mockFetchAbortable() {
  return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

// ---------------------------------------------------------------------------
describe("Timeout handling (F3)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("openai-compatible does not retry after a timeout - avoids re-billing an already-sent prompt", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);

    const adapter = new OpenAIAdapter("sk-test", { timeoutMs: 100, retryDelayMs: 0 });
    const assertion = expect(adapter.run("p")).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await assertion;

    expect(f).toHaveBeenCalledOnce();
  });

  it("anthropic does not retry after a timeout", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);

    const adapter = new AnthropicAdapter("sk-ant-test", { timeoutMs: 100, retryDelayMs: 0 });
    const assertion = expect(adapter.run("p")).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await assertion;

    expect(f).toHaveBeenCalledOnce();
  });

  it("gemini does not retry after a timeout", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);

    const adapter = new GeminiAdapter("AIza-test", { timeoutMs: 100, retryDelayMs: 0 });
    const assertion = expect(adapter.run("p")).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await assertion;

    expect(f).toHaveBeenCalledOnce();
  });

  // issue #35 slice 3: a timeout must throw a distinguishable
  // AdapterTimeoutError, not a generic Error - the prompt-run handler
  // needs to tell "the provider took too long" apart from every other
  // failure reason without string-matching the error message.
  it("openai-compatible throws AdapterTimeoutError (not a generic Error) on timeout", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);
    const adapter = new OpenAIAdapter("sk-test", { timeoutMs: 100, retryDelayMs: 0 });
    const runPromise = adapter.run("p");
    const assertion = expect(runPromise).rejects.toBeInstanceOf(AdapterTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("anthropic throws AdapterTimeoutError (not a generic Error) on timeout", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);
    const adapter = new AnthropicAdapter("sk-ant-test", { timeoutMs: 100, retryDelayMs: 0 });
    const runPromise = adapter.run("p");
    const assertion = expect(runPromise).rejects.toBeInstanceOf(AdapterTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("gemini throws AdapterTimeoutError (not a generic Error) on timeout", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);
    const adapter = new GeminiAdapter("AIza-test", { timeoutMs: 100, retryDelayMs: 0 });
    const runPromise = adapter.run("p");
    const assertion = expect(runPromise).rejects.toBeInstanceOf(AdapterTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

// ---------------------------------------------------------------------------
describe("resolveTimeoutMs (F3)", () => {
  it("defaults to 30000ms", () => {
    expect(resolveTimeoutMs()).toBe(30_000);
  });

  it("honors an explicit override", () => {
    expect(resolveTimeoutMs(500)).toBe(500);
  });

  it("honors the LLM_TIMEOUT_MS env var when no override is given", () => {
    vi.stubEnv("LLM_TIMEOUT_MS", "90000");
    expect(resolveTimeoutMs()).toBe(90_000);
  });

  it("prefers an explicit override over the env var", () => {
    vi.stubEnv("LLM_TIMEOUT_MS", "90000");
    expect(resolveTimeoutMs(500)).toBe(500);
  });

  it("falls back to the default on a non-numeric env var", () => {
    vi.stubEnv("LLM_TIMEOUT_MS", "not-a-number");
    expect(resolveTimeoutMs()).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
describe("Output caps (F2)", () => {
  it("openai-compatible sends the default 1500 max_tokens cap", async () => {
    const f = mockFetch([{ status: 200, body: OPENAI_BODY }]);
    vi.stubGlobal("fetch", f);
    await new OpenAIAdapter("sk-test", { retryDelayMs: 0 }).run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(1500);
  });

  it("honors a custom maxTokens option", async () => {
    const f = mockFetch([{ status: 200, body: OPENAI_BODY }]);
    vi.stubGlobal("fetch", f);
    await new OpenAIAdapter("sk-test", { retryDelayMs: 0, maxTokens: 4096 }).run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it("honors the LLM_MAX_OUTPUT_TOKENS env override", async () => {
    vi.stubEnv("LLM_MAX_OUTPUT_TOKENS", "800");
    const f = mockFetch([{ status: 200, body: OPENAI_BODY }]);
    vi.stubGlobal("fetch", f);
    await new OpenAIAdapter("sk-test", { retryDelayMs: 0 }).run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(800);
  });

  it("anthropic sends the shared default cap instead of the old hardcoded 1024", async () => {
    const f = mockFetch([{ status: 200, body: ANTHROPIC_BODY }]);
    vi.stubGlobal("fetch", f);
    await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 }).run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(1500);
  });

  it("gemini sends generationConfig.maxOutputTokens", async () => {
    const f = mockFetch([{ status: 200, body: GEMINI_BODY }]);
    vi.stubGlobal("fetch", f);
    await new GeminiAdapter("AIza-test", { retryDelayMs: 0 }).run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
describe("OpenAIAdapter", () => {
  it("returns RawResponse with text and extracted URL citations", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: OPENAI_BODY }]));
    const a = new OpenAIAdapter("sk-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.text).toContain("Acme SEO");
    expect(r.modelVariant).toBe("gpt-4o");
    expect(r.requestedModel).toBe("gpt-4o");
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
  });

  // issue #35 slice 2: requestedModel is the model this adapter instance was
  // configured to call, captured independent of whatever the provider
  // echoes back - proves the two fields are genuinely separate signals, not
  // just aliases of each other.
  it("captures the requested model separately from a different actual model returned by the provider", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...OPENAI_BODY, model: "gpt-4o-2026-01-01" } }]));
    const a = new OpenAIAdapter("sk-test", { model: "gpt-4o-mini", retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.requestedModel).toBe("gpt-4o-mini");
    expect(r.modelVariant).toBe("gpt-4o-2026-01-01");
  });

  it("retries on 429 and succeeds", async () => {
    vi.stubGlobal("fetch", mockFetch([
      { status: 429, body: {} },
      { status: 200, body: OPENAI_BODY },
    ]));
    const a = new OpenAIAdapter("sk-test", { retryDelayMs: 0 });
    const r = await a.run("prompt");
    expect(r.text).toBeTruthy();
  });

  it("throws after exhausting retries", async () => {
    vi.stubGlobal("fetch", mockFetch([
      { status: 429, body: {} }, { status: 429, body: {} }, { status: 429, body: {} },
    ]));
    await expect(new OpenAIAdapter("sk-test", { retryDelayMs: 0 }).run("p")).rejects.toThrow();
  });

  it("throws when API key is empty", async () => {
    await expect(new OpenAIAdapter("").run("p")).rejects.toThrow(/key/i);
  });

  it("extracts token usage from the OpenAI usage block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: OPENAI_BODY }]));
    const r = await new OpenAIAdapter("sk-test", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toEqual({ inputTokens: 42, outputTokens: 117 });
  });

  it("returns null usage when the provider omits the usage block", async () => {
    const { usage: _usage, ...bodyWithoutUsage } = OPENAI_BODY;
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: bodyWithoutUsage }]));
    const r = await new OpenAIAdapter("sk-test", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("AnthropicAdapter", () => {
  it("returns RawResponse from Anthropic messages format", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: ANTHROPIC_BODY }]));
    const a = new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.text).toContain("Acme SEO");
    expect(r.requestedModel).toBe("claude-opus-4-5");
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
  });

  it("captures the requested model separately from a different actual model returned by the provider", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...ANTHROPIC_BODY, model: "claude-opus-4-5-20260201" } }]));
    const a = new AnthropicAdapter("sk-ant-test", { model: "claude-haiku-4-5", retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.requestedModel).toBe("claude-haiku-4-5");
    expect(r.modelVariant).toBe("claude-opus-4-5-20260201");
  });

  it("retries on 429 and succeeds", async () => {
    vi.stubGlobal("fetch", mockFetch([
      { status: 429, body: {} },
      { status: 200, body: ANTHROPIC_BODY },
    ]));
    const r = await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 }).run("p");
    expect(r.text).toBeTruthy();
  });

  it("throws when API key is empty", async () => {
    await expect(new AnthropicAdapter("").run("p")).rejects.toThrow(/key/i);
  });

  it("extracts token usage from the Anthropic usage block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: ANTHROPIC_BODY }]));
    const r = await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toEqual({ inputTokens: 42, outputTokens: 117 });
  });

  it("selects the LAST text block, not the first, when the response has multiple (e.g. a tool-use preamble)", async () => {
    const MULTI_TEXT_BODY = {
      ...ANTHROPIC_BODY,
      content: [
        { type: "text", text: "Let me check that for you." },
        { type: "mcp_tool_use", id: "toolu_1", name: "rankrocket_status", input: {} },
        { type: "mcp_tool_result", tool_use_id: "toolu_1", content: [] },
        { type: "text", text: "Final answer: the plugin is active." },
      ],
    };
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: MULTI_TEXT_BODY }]));
    const r = await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 }).run("p");
    expect(r.text).toBe("Final answer: the plugin is active.");
  });
});

// ---------------------------------------------------------------------------
describe("AnthropicAdapter MCP connector", () => {
  const MCP_OPTS = {
    mcp: { url: "https://mcp.example.com/mcp", token: "rrmcp-token", serverName: "rankrocket" },
  };

  it("adds mcp_servers, the mcp_toolset tool, and the beta header when mcp opts are passed", async () => {
    const f = mockFetch([{ status: 200, body: ANTHROPIC_BODY }]);
    vi.stubGlobal("fetch", f);
    await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0, ...MCP_OPTS }).run("p");

    const [, init] = f.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["anthropic-beta"]).toBe("mcp-client-2025-11-20");

    const body = JSON.parse(init.body as string);
    expect(body.mcp_servers).toEqual([
      { type: "url", url: "https://mcp.example.com/mcp", name: "rankrocket", authorization_token: "rrmcp-token" },
    ]);
    expect(body.tools).toEqual([{ type: "mcp_toolset", mcp_server_name: "rankrocket" }]);
  });

  it("does not add mcp_servers, tools, or the beta header when mcp opts are omitted (regression guard)", async () => {
    const f = mockFetch([{ status: 200, body: ANTHROPIC_BODY }]);
    vi.stubGlobal("fetch", f);
    await new AnthropicAdapter("sk-ant-test", { retryDelayMs: 0 }).run("p");

    const [, init] = f.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["anthropic-beta"]).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.mcp_servers).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("GeminiAdapter", () => {
  it("returns RawResponse from Gemini candidates format", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: GEMINI_BODY }]));
    const a = new GeminiAdapter("AIza-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.text).toContain("Acme SEO");
    expect(r.requestedModel).toBe("gemini-2.0-flash");
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
  });

  it("captures the requested model separately from a different actual model returned by the provider", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...GEMINI_BODY, modelVersion: "gemini-2.5-flash" } }]));
    const a = new GeminiAdapter("AIza-test", { model: "gemini-2.0-flash", retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.requestedModel).toBe("gemini-2.0-flash");
    expect(r.modelVariant).toBe("gemini-2.5-flash");
  });

  it("retries on 429 and succeeds", async () => {
    vi.stubGlobal("fetch", mockFetch([
      { status: 429, body: {} },
      { status: 200, body: GEMINI_BODY },
    ]));
    const r = await new GeminiAdapter("AIza-test", { retryDelayMs: 0 }).run("p");
    expect(r.text).toBeTruthy();
  });

  it("throws when API key is empty", async () => {
    await expect(new GeminiAdapter("").run("p")).rejects.toThrow(/key/i);
  });

  it("extracts token usage from the Gemini usageMetadata block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: GEMINI_BODY }]));
    const r = await new GeminiAdapter("AIza-test", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toEqual({ inputTokens: 42, outputTokens: 117 });
  });
});

// ---------------------------------------------------------------------------
describe("GroqAdapter (Llama via Groq)", () => {
  it("returns RawResponse with correct id", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...OPENAI_BODY, model: "llama-3.3-70b-versatile" } }]));
    const a = new GroqAdapter("gsk-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(a.id).toBe("groq");
    expect(r.modelVariant).toBe("llama-3.3-70b-versatile");
    expect(r.requestedModel).toBe("llama-3.3-70b-versatile");
  });

  it("throws when API key is empty", async () => {
    await expect(new GroqAdapter("").run("p")).rejects.toThrow(/key/i);
  });
});

// ---------------------------------------------------------------------------
describe("MistralAdapter", () => {
  it("returns RawResponse with correct id", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...OPENAI_BODY, model: "mistral-large-latest" } }]));
    const a = new MistralAdapter("mst-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(a.id).toBe("mistral");
    expect(r.modelVariant).toBe("mistral-large-latest");
    expect(r.requestedModel).toBe("mistral-large-latest");
  });

  it("throws when API key is empty", async () => {
    await expect(new MistralAdapter("").run("p")).rejects.toThrow(/key/i);
  });
});

// ---------------------------------------------------------------------------
describe("DeepSeekAdapter", () => {
  it("returns RawResponse with correct id", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...OPENAI_BODY, model: "deepseek-chat" } }]));
    const a = new DeepSeekAdapter("dsk-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(a.id).toBe("deepseek");
    expect(r.modelVariant).toBe("deepseek-chat");
    expect(r.requestedModel).toBe("deepseek-chat");
  });

  it("throws when API key is empty", async () => {
    await expect(new DeepSeekAdapter("").run("p")).rejects.toThrow(/key/i);
  });
});
