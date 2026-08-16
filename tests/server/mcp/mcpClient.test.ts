/*
 * Module/Script Name: mcpClient.test.ts
 * Path: tests/server/mcp/mcpClient.test.ts
 *
 * Description:
 * Tests for connectMcpClient() - the thin wrapper around
 * @modelcontextprotocol/sdk's Client + StreamableHTTPClientTransport.
 * Mocks the SDK classes at the module boundary rather than hitting a real
 * server, matching this repo's existing adapter-mocking style.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnect = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockClose = vi.fn();

const mockClientCtor = vi.fn().mockImplementation(() => ({
  connect: mockConnect,
  listTools: mockListTools,
  callTool: mockCallTool,
  close: mockClose,
}));

const mockTransportCtor = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: mockClientCtor,
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: mockTransportCtor,
}));

const { connectMcpClient } = await import("../../../server/mcp/mcpClient");

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
});

describe("connectMcpClient", () => {
  it("constructs the transport with the given URL and a Bearer auth header, then connects", async () => {
    await connectMcpClient("https://mcp.example.com/mcp", "rrmcp-token");

    expect(mockTransportCtor).toHaveBeenCalledTimes(1);
    const [url, opts] = mockTransportCtor.mock.calls[0] as [URL, { requestInit: RequestInit }];
    expect(url.toString()).toBe("https://mcp.example.com/mcp");
    expect((opts.requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer rrmcp-token"
    );
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("listTools() maps the SDK tool list to McpTool[], defaulting a missing description to empty string", async () => {
    mockListTools.mockResolvedValue({
      tools: [
        { name: "rankrocket_status", description: "Get status", inputSchema: { type: "object" } },
        { name: "rankrocket_no_desc", inputSchema: { type: "object" } },
      ],
    });

    const client = await connectMcpClient("https://mcp.example.com/mcp", "t");
    const tools = await client.listTools();

    expect(tools).toEqual([
      { name: "rankrocket_status", description: "Get status", inputSchema: { type: "object" } },
      { name: "rankrocket_no_desc", description: "", inputSchema: { type: "object" } },
    ]);
  });

  it("callTool() flattens text content blocks and reports isError", async () => {
    mockCallTool.mockResolvedValue({
      content: [
        { type: "text", text: "line one" },
        { type: "text", text: "line two" },
      ],
      isError: false,
    });

    const client = await connectMcpClient("https://mcp.example.com/mcp", "t");
    const result = await client.callTool("rankrocket_status", { site: "tristate-hvac" });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: "rankrocket_status",
      arguments: { site: "tristate-hvac" },
    });
    expect(result).toEqual({ isError: false, content: "line one\nline two" });
  });

  it("callTool() returns empty content (not a crash) when there are no text blocks", async () => {
    mockCallTool.mockResolvedValue({ content: [{ type: "image", data: "x", mimeType: "image/png" }] });

    const client = await connectMcpClient("https://mcp.example.com/mcp", "t");
    const result = await client.callTool("rankrocket_images", {});

    expect(result).toEqual({ isError: false, content: "" });
  });

  it("callTool() surfaces isError: true from the MCP tool result", async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "site not found" }],
      isError: true,
    });

    const client = await connectMcpClient("https://mcp.example.com/mcp", "t");
    const result = await client.callTool("rankrocket_status", { site: "bogus" });

    expect(result).toEqual({ isError: true, content: "site not found" });
  });

  it("close() delegates to the SDK client's close()", async () => {
    const client = await connectMcpClient("https://mcp.example.com/mcp", "t");
    await client.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
