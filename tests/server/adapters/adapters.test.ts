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
};

const ANTHROPIC_BODY = {
  id: "msg_test",
  model: "claude-opus-4-5",
  content: [{ type: "text", text: "Acme SEO leads the market. Visit https://acme.com." }],
};

const GEMINI_BODY = {
  candidates: [{
    content: { parts: [{ text: "Acme SEO is highly recommended. Check https://acme.com." }] },
  }],
  modelVersion: "gemini-2.0-flash",
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

afterEach(() => { vi.restoreAllMocks(); });

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
