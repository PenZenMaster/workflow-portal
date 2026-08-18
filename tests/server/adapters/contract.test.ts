/*
 * Module/Script Name: contract.test.ts
 * Path: tests/server/adapters/contract.test.ts
 *
 * Description:
 * issue #3 Epic 1 slice 5 (issue #35, final slice): the standard
 * adapter-contract test suite. Runs one shared set of behavioral
 * assertions against every enabled provider (openai, anthropic, gemini,
 * groq, mistral, deepseek, perplexity), parameterized via describe.each,
 * so a new adapter can't silently ship without the same baseline
 * coverage the best-tested adapters already had (empty-key guard, retry/
 * no-retry rules, timeout handling, output-token cap, usage extraction,
 * requestedModel/modelVariant separation, providerRequestId capture).
 * This does not replace each adapter's own test file - provider-specific
 * behavior (e.g. Anthropic's last-text-block selection, Perplexity's
 * native ordered citations) still lives there.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 issue #35 slice 5 (final slice of the Epic 1 roadmap)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIAdapter } from "../../../server/adapters/openai";
import { AnthropicAdapter } from "../../../server/adapters/anthropic";
import { GeminiAdapter } from "../../../server/adapters/gemini";
import { GroqAdapter } from "../../../server/adapters/groq";
import { MistralAdapter } from "../../../server/adapters/mistral";
import { DeepSeekAdapter } from "../../../server/adapters/deepseek";
import { PerplexityAdapter } from "../../../server/adapters/perplexity";
import { AdapterTimeoutError } from "../../../server/adapters/types";
import type { PlatformAdapter } from "../../../server/adapters/types";

const TEXT = "Acme SEO is the top agency. See https://acme.com for details.";
const REQUEST_ID = "test-id-123";

type AdapterOpts = {
  model?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxTokens?: number;
};

interface Fixture {
  name: string;
  make: (key: string, opts?: AdapterOpts) => PlatformAdapter;
  defaultModel: string;
  buildBody: (model: string, usage?: unknown) => unknown;
  usageBlock: unknown;
  sentMaxTokens: (sentBody: Record<string, unknown>) => unknown;
  hasProviderRequestId: boolean;
}

function openAiStyleBody(model: string, usage?: unknown) {
  return {
    id: REQUEST_ID,
    model,
    choices: [{ message: { content: TEXT } }],
    ...(usage !== undefined ? { usage } : {}),
  };
}

const FIXTURES: Fixture[] = [
  {
    name: "openai",
    make: (k, o) => new OpenAIAdapter(k, o),
    defaultModel: "gpt-4o",
    buildBody: openAiStyleBody,
    usageBlock: { prompt_tokens: 42, completion_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
  {
    name: "groq",
    make: (k, o) => new GroqAdapter(k, o),
    defaultModel: "llama-3.3-70b-versatile",
    buildBody: openAiStyleBody,
    usageBlock: { prompt_tokens: 42, completion_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
  {
    name: "mistral",
    make: (k, o) => new MistralAdapter(k, o),
    defaultModel: "mistral-large-latest",
    buildBody: openAiStyleBody,
    usageBlock: { prompt_tokens: 42, completion_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
  {
    name: "deepseek",
    make: (k, o) => new DeepSeekAdapter(k, o),
    defaultModel: "deepseek-v4-flash",
    buildBody: openAiStyleBody,
    usageBlock: { prompt_tokens: 42, completion_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
  {
    name: "anthropic",
    make: (k, o) => new AnthropicAdapter(k, o),
    defaultModel: "claude-opus-4-5",
    buildBody: (model, usage) => ({
      id: REQUEST_ID,
      model,
      content: [{ type: "text", text: TEXT }],
      ...(usage !== undefined ? { usage } : {}),
    }),
    usageBlock: { input_tokens: 42, output_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
  {
    name: "gemini",
    make: (k, o) => new GeminiAdapter(k, o),
    defaultModel: "gemini-3.5-flash",
    // generateContent's response body has no request-id field at all -
    // providerRequestId is always null for this adapter, not a gap.
    buildBody: (model, usage) => ({
      candidates: [{ content: { parts: [{ text: TEXT }] } }],
      modelVersion: model,
      ...(usage !== undefined ? { usageMetadata: usage } : {}),
    }),
    usageBlock: { promptTokenCount: 42, candidatesTokenCount: 117 },
    sentMaxTokens: (b) => (b.generationConfig as Record<string, unknown> | undefined)?.maxOutputTokens,
    hasProviderRequestId: false,
  },
  {
    name: "perplexity",
    make: (k, o) => new PerplexityAdapter(k, o),
    defaultModel: "sonar",
    buildBody: openAiStyleBody,
    usageBlock: { prompt_tokens: 42, completion_tokens: 117 },
    sentMaxTokens: (b) => b.max_tokens,
    hasProviderRequestId: true,
  },
];

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each(FIXTURES)("Adapter contract: $name", (fx) => {
  it("throws when the API key is empty", async () => {
    await expect(fx.make("").run("p")).rejects.toThrow(/key/i);
  });

  it("returns a RawResponse with text, requestedModel, numeric latencyMs, and providerRequestId", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) }]));
    const r = await fx.make("test-key", { retryDelayMs: 0 }).run("Best SEO agency");
    expect(r.text).toContain("Acme SEO");
    expect(r.requestedModel).toBe(fx.defaultModel);
    expect(typeof r.latencyMs).toBe("number");
    expect(r.providerRequestId).toBe(fx.hasProviderRequestId ? REQUEST_ID : null);
  });

  it("captures the requested model separately from a different actual model returned by the provider", async () => {
    const actualModel = `${fx.defaultModel}-actual-variant`;
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: fx.buildBody(actualModel, fx.usageBlock) }]));
    const r = await fx.make("test-key", { model: "requested-model-x", retryDelayMs: 0 }).run("p");
    expect(r.requestedModel).toBe("requested-model-x");
    expect(r.modelVariant).toBe(actualModel);
  });

  it("extracts token usage from the provider's usage block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) }]));
    const r = await fx.make("test-key", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toEqual({ inputTokens: 42, outputTokens: 117 });
  });

  it("returns null usage when the provider omits the usage block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, undefined) }]));
    const r = await fx.make("test-key", { retryDelayMs: 0 }).run("p");
    expect(r.usage).toBeNull();
  });

  it("retries on 429 and succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { status: 429, body: {} },
        { status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) },
      ])
    );
    const r = await fx.make("test-key", { retryDelayMs: 0 }).run("p");
    expect(r.text).toBeTruthy();
  });

  it("throws after exhausting retries on persistent 429", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ status: 429, body: {} }, { status: 429, body: {} }, { status: 429, body: {} }])
    );
    await expect(fx.make("test-key", { retryDelayMs: 0 }).run("p")).rejects.toThrow();
  });

  it("throws immediately on a 400 bad request, without retrying", async () => {
    const f = mockFetch([{ status: 400, body: { error: "bad request" } }]);
    vi.stubGlobal("fetch", f);
    await expect(fx.make("test-key", { retryDelayMs: 0 }).run("p")).rejects.toThrow();
    expect(f).toHaveBeenCalledOnce();
  });

  it("does not retry after a timeout and throws AdapterTimeoutError", async () => {
    vi.useFakeTimers();
    const f = mockFetchAbortable();
    vi.stubGlobal("fetch", f);
    const runPromise = fx.make("test-key", { timeoutMs: 100, retryDelayMs: 0 }).run("p");
    const assertion = expect(runPromise).rejects.toBeInstanceOf(AdapterTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(f).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("sends the default 1500 output-token cap", async () => {
    const f = mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) }]);
    vi.stubGlobal("fetch", f);
    await fx.make("test-key", { retryDelayMs: 0 }).run("p");
    const sentBody = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(fx.sentMaxTokens(sentBody)).toBe(1500);
  });

  it("honors a custom maxTokens option", async () => {
    const f = mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) }]);
    vi.stubGlobal("fetch", f);
    await fx.make("test-key", { retryDelayMs: 0, maxTokens: 4096 }).run("p");
    const sentBody = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(fx.sentMaxTokens(sentBody)).toBe(4096);
  });

  it("honors the LLM_MAX_OUTPUT_TOKENS env override", async () => {
    vi.stubEnv("LLM_MAX_OUTPUT_TOKENS", "800");
    const f = mockFetch([{ status: 200, body: fx.buildBody(fx.defaultModel, fx.usageBlock) }]);
    vi.stubGlobal("fetch", f);
    await fx.make("test-key", { retryDelayMs: 0 }).run("p");
    const sentBody = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(fx.sentMaxTokens(sentBody)).toBe(800);
  });
});
