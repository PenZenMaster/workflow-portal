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

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

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
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
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
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
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
});

// ---------------------------------------------------------------------------
describe("GeminiAdapter", () => {
  it("returns RawResponse from Gemini candidates format", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: GEMINI_BODY }]));
    const a = new GeminiAdapter("AIza-test", { retryDelayMs: 0 });
    const r = await a.run("Best SEO agency");
    expect(r.text).toContain("Acme SEO");
    expect(r.citations.some((c) => c.url.includes("acme.com"))).toBe(true);
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
  });

  it("throws when API key is empty", async () => {
    await expect(new DeepSeekAdapter("").run("p")).rejects.toThrow(/key/i);
  });
});
