/*
 * Module/Script Name: utility.test.ts
 * Path: tests/server/adapters/utility.test.ts
 *
 * Description:
 * Tests for the utility-model adapter tier (issue #2 F4): internal calls
 * (prompt generation, CSV runs) use cheap models with a larger output
 * cap, while measurement surfaces keep their default models.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 F2+F4 slice initial implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getUtilityAdapter } from "../../../server/adapters/registry";

const OPENAI_BODY = {
  id: "chatcmpl-test",
  model: "gpt-4o-mini",
  choices: [{ message: { content: "ok" } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

const ANTHROPIC_BODY = {
  id: "msg_test",
  model: "claude-haiku-4-5-20251001",
  content: [{ type: "text", text: "ok" }],
  usage: { input_tokens: 1, output_tokens: 1 },
};

function mockFetch(body: unknown) {
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

function sentBody(f: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("getUtilityAdapter (F4)", () => {
  it("returns undefined when the provider key is not configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(getUtilityAdapter("openai")).toBeUndefined();
  });

  it("returns undefined for an unknown slug", () => {
    expect(getUtilityAdapter("not-a-provider")).toBeUndefined();
  });

  it("builds an openai adapter on the utility model with the 4096 utility cap", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const f = mockFetch(OPENAI_BODY);
    vi.stubGlobal("fetch", f);

    const adapter = getUtilityAdapter("openai")!;
    await adapter.run("p");

    const body = sentBody(f);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(4096);
  });

  it("uses the economy Anthropic model for utility calls", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const f = mockFetch(ANTHROPIC_BODY);
    vi.stubGlobal("fetch", f);

    const adapter = getUtilityAdapter("anthropic")!;
    await adapter.run("p");

    const body = sentBody(f);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.max_tokens).toBe(4096);
  });

  it("honors the UTILITY_MODEL_<SLUG> env override", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("UTILITY_MODEL_OPENAI", "my-custom-mini");
    const f = mockFetch(OPENAI_BODY);
    vi.stubGlobal("fetch", f);

    const adapter = getUtilityAdapter("openai")!;
    await adapter.run("p");

    expect(sentBody(f).model).toBe("my-custom-mini");
  });
});
