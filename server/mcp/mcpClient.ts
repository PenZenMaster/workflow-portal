/*
 * Module/Script Name: mcpClient.ts
 * Path: server/mcp/mcpClient.ts
 *
 * Description:
 * Thin, testable wrapper around @modelcontextprotocol/sdk's Client +
 * StreamableHTTPClientTransport - lets workflow-portal act as its own MCP
 * client against any remote MCP server that authenticates via a plain
 * bearer token (Streamable HTTP transport). Introduced in place of
 * Anthropic's server-side MCP connector, which was verified in production
 * not to work against a non-OAuth (static-bearer) MCP server like
 * rankrocket-mcp - see docs/projectStatus.md for the diagnosis.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpToolResult {
  isError: boolean;
  content: string;
}

export interface McpClientSource {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<McpToolResult>;
  close(): Promise<void>;
}

const CLIENT_INFO = { name: "workflow-portal", version: "1.0.0" };

export async function connectMcpClient(url: string, token: string): Promise<McpClientSource> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  await client.connect(transport);

  return {
    async listTools() {
      const { tools } = await client.listTools();
      return tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      }));
    },

    async callTool(name: string, args: unknown) {
      const result = await client.callTool({
        name,
        arguments: args as Record<string, unknown> | undefined,
      });
      // callTool()'s return type is a union: the standard shape (a
      // `content` block array) or a legacy `{ toolResult }` shape. Every
      // tool this app calls returns the standard shape; narrow instead of
      // assuming so a legacy response degrades to empty text rather than
      // throwing.
      const blocks = "content" in result && Array.isArray(result.content) ? result.content : [];
      const content = blocks
        .filter((c): c is { type: "text"; text: string } => c?.type === "text")
        .map((c) => c.text)
        .join("\n");
      const isError = "isError" in result && typeof result.isError === "boolean" ? result.isError : false;
      return { isError, content };
    },

    async close() {
      await client.close();
    },
  };
}
