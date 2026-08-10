import { describe, it, expect, vi, afterEach } from "vitest";
import { PerplexityAdapter } from "../../../server/adapters/perplexity";
import { AdapterTimeoutError } from "../../../server/adapters/types";

const MOCK_SUCCESS_RESPONSE = {
  id: "test-id",
  model: "sonar",
  choices: [
    {
      message: {
        content: "Acme Corp is the leading SEO agency in Seattle. [1] They offer comprehensive services.",
      },
    },
  ],
  citations: ["https://example.com/acme", "https://review-site.com/acme"],
  usage: { prompt_tokens: 42, completion_tokens: 117, total_tokens: 159 },
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

describe("PerplexityAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a RawResponse on success", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: MOCK_SUCCESS_RESPONSE }]));
    const adapter = new PerplexityAdapter("test-key");
    const result = await adapter.run("Best SEO agency in Seattle");
    expect(result.text).toContain("Acme Corp");
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].url).toBe("https://example.com/acme");
    expect(result.citations[0].position).toBe(1);
    expect(result.modelVariant).toBe("sonar");
    expect(result.requestedModel).toBe("sonar");
    expect(result.latencyMs).toBeTypeOf("number");
  });

  // issue #35 slice 2: requestedModel is the model this adapter instance
  // was configured to call, captured independent of whatever the provider
  // echoes back in its response.
  it("captures the requested model separately from a different actual model returned by the provider", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { ...MOCK_SUCCESS_RESPONSE, model: "sonar-pro" } }]));
    const adapter = new PerplexityAdapter("test-key", { model: "sonar" });
    const result = await adapter.run("Best SEO agency in Seattle");
    expect(result.requestedModel).toBe("sonar");
    expect(result.modelVariant).toBe("sonar-pro");
  });

  it("sends the default 1500 max_tokens output cap (F2)", async () => {
    const f = mockFetch([{ status: 200, body: MOCK_SUCCESS_RESPONSE }]);
    vi.stubGlobal("fetch", f);
    await new PerplexityAdapter("test-key").run("p");
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(1500);
  });

  it("extracts token usage from the usage block", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: MOCK_SUCCESS_RESPONSE }]));
    const result = await new PerplexityAdapter("test-key").run("p");
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 117 });
  });

  it("extracts citations in order", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: MOCK_SUCCESS_RESPONSE }]));
    const adapter = new PerplexityAdapter("test-key");
    const result = await adapter.run("test prompt");
    expect(result.citations[0].position).toBe(1);
    expect(result.citations[1].position).toBe(2);
  });

  it("retries on 429 and succeeds on the third attempt", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { status: 429, body: { error: "rate limited" } },
        { status: 429, body: { error: "rate limited" } },
        { status: 200, body: MOCK_SUCCESS_RESPONSE },
      ])
    );
    const adapter = new PerplexityAdapter("test-key", { retryDelayMs: 0 });
    const result = await adapter.run("test prompt");
    expect(result.text).toContain("Acme Corp");
  });

  it("throws after exhausting retries on persistent 429", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { status: 429, body: {} },
        { status: 429, body: {} },
        { status: 429, body: {} },
        { status: 429, body: {} },
      ])
    );
    const adapter = new PerplexityAdapter("test-key", { retryDelayMs: 0 });
    await expect(adapter.run("test prompt")).rejects.toThrow();
  });

  it("retries on 5xx server errors", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { status: 500, body: {} },
        { status: 200, body: MOCK_SUCCESS_RESPONSE },
      ])
    );
    const adapter = new PerplexityAdapter("test-key", { retryDelayMs: 0 });
    const result = await adapter.run("test prompt");
    expect(result.text).toBeTruthy();
  });

  it("throws immediately on 400 bad request (no retry)", async () => {
    const fetchMock = mockFetch([{ status: 400, body: { error: "bad request" } }]);
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PerplexityAdapter("test-key", { retryDelayMs: 0 });
    await expect(adapter.run("test prompt")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce(); // no retries
  });

  it("throws when no API key provided", async () => {
    const adapter = new PerplexityAdapter("");
    await expect(adapter.run("test prompt")).rejects.toThrow(/API key/i);
  });

  it("does not retry after a timeout - avoids re-billing an already-sent prompt (F3)", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", f);

    const adapter = new PerplexityAdapter("test-key", { timeoutMs: 100, retryDelayMs: 0 });
    const assertion = expect(adapter.run("test prompt")).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await assertion;

    expect(f).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  // issue #35 slice 3: distinguishable timeout error, not a generic Error.
  it("throws AdapterTimeoutError (not a generic Error) on timeout", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", f);

    const adapter = new PerplexityAdapter("test-key", { timeoutMs: 100, retryDelayMs: 0 });
    const runPromise = adapter.run("test prompt");
    const assertion = expect(runPromise).rejects.toBeInstanceOf(AdapterTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
