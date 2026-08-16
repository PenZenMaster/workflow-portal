/*
 * Module/Script Name: anthropicToolLoop.test.ts
 * Path: tests/server/adapters/anthropicToolLoop.test.ts
 *
 * Description:
 * Tests for runAnthropicWithTools() - the hand-rolled Claude tool-call
 * loop that replaces Anthropic's MCP connector (proven non-functional
 * against a non-OAuth MCP server). Mirrors adapters.test.ts's mockFetch
 * pattern; executeTool is mocked per test rather than a real MCP client.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { runAnthropicWithTools } from "../../../server/adapters/anthropicToolLoop";

const TOOLS = [
  { name: "rankrocket_status", description: "Get status", input_schema: { type: "object" } },
];

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
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

function sentBody(f: ReturnType<typeof vi.fn>, callIndex: number): Record<string, unknown> {
  return JSON.parse((f.mock.calls[callIndex][1] as RequestInit).body as string);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAnthropicWithTools", () => {
  it("returns the final text directly when Claude never calls a tool", async () => {
    const f = mockFetchSequence([
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "No tool needed, here is the answer." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ]);
    vi.stubGlobal("fetch", f);

    const executeTool = vi.fn();
    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "What's the capital of France?",
      TOOLS,
      executeTool,
      { retryDelayMs: 0 }
    );

    expect(result.text).toBe("No tool needed, here is the answer.");
    expect(executeTool).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("executes a tool call, feeds the result back, and returns the final text", async () => {
    const f = mockFetchSequence([
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [
            { type: "text", text: "Let me check." },
            { type: "tool_use", id: "toolu_1", name: "rankrocket_status", input: { site: "tristate-hvac" } },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "The plugin is active." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 8 },
        },
      },
    ]);
    vi.stubGlobal("fetch", f);

    const executeTool = vi.fn().mockResolvedValue({ isError: false, content: "plugin_active: true" });
    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "Is the plugin active on tristate-hvac?",
      TOOLS,
      executeTool,
      { retryDelayMs: 0 }
    );

    expect(executeTool).toHaveBeenCalledWith("rankrocket_status", { site: "tristate-hvac" });
    expect(result.text).toBe("The plugin is active.");
    expect(f).toHaveBeenCalledTimes(2);

    const secondBody = sentBody(f, 1);
    const messages = secondBody.messages as Array<{ role: string; content: unknown }>;
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "plugin_active: true", is_error: false },
    ]);
  });

  it("executes multiple parallel tool_use blocks and returns all results in one follow-up message", async () => {
    const f = mockFetchSequence([
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [
            { type: "tool_use", id: "toolu_1", name: "rankrocket_status", input: {} },
            { type: "tool_use", id: "toolu_2", name: "rankrocket_status", input: { site: "other" } },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "Both checked." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 8 },
        },
      },
    ]);
    vi.stubGlobal("fetch", f);

    const executeTool = vi.fn().mockResolvedValue({ isError: false, content: "ok" });
    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "Check both sites",
      TOOLS,
      executeTool,
      { retryDelayMs: 0 }
    );

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Both checked.");

    const secondBody = sentBody(f, 1);
    const messages = secondBody.messages as Array<{ role: string; content: unknown[] }>;
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.content).toHaveLength(2);
  });

  it("catches a throwing executeTool and reports it to Claude as an is_error tool_result", async () => {
    const f = mockFetchSequence([
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "tool_use", id: "toolu_1", name: "rankrocket_status", input: {} }],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "Something went wrong checking the site." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 8 },
        },
      },
    ]);
    vi.stubGlobal("fetch", f);

    const executeTool = vi.fn().mockRejectedValue(new Error("MCP server unreachable"));
    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "Check the site",
      TOOLS,
      executeTool,
      { retryDelayMs: 0 }
    );

    expect(result.text).toBe("Something went wrong checking the site.");
    const secondBody = sentBody(f, 1);
    const messages = secondBody.messages as Array<{ role: string; content: Array<{ is_error: boolean; content: string }> }>;
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.content[0].is_error).toBe(true);
    expect(lastMessage.content[0].content).toContain("MCP server unreachable");
  });

  it("stops after maxIterations and returns whatever text is available rather than looping forever", async () => {
    const alwaysToolUse = {
      status: 200,
      body: {
        model: "claude-opus-5",
        content: [{ type: "tool_use", id: "toolu_x", name: "rankrocket_status", input: {} }],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    };
    const f = mockFetchSequence([alwaysToolUse]);
    vi.stubGlobal("fetch", f);

    const executeTool = vi.fn().mockResolvedValue({ isError: false, content: "ok" });
    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "loop forever",
      TOOLS,
      executeTool,
      { retryDelayMs: 0, maxIterations: 3 }
    );

    expect(result.text).toBe("");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 and succeeds", async () => {
    const f = mockFetchSequence([
      { status: 429, body: {} },
      {
        status: 200,
        body: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ]);
    vi.stubGlobal("fetch", f);

    const result = await runAnthropicWithTools(
      "sk-ant-test",
      "claude-opus-5",
      "p",
      TOOLS,
      vi.fn(),
      { retryDelayMs: 0 }
    );
    expect(result.text).toBe("ok");
  });
});
