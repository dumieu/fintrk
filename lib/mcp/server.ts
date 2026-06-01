import "server-only";
import {
  DEFAULT_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@/lib/mcp/config";
import { TOOL_DEFS, runTool, type ToolMeta } from "@/lib/mcp/tools";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcContext {
  userId: string;
  meta: ToolMeta;
}

const INSTRUCTIONS =
  "FinTRK is the user's personal finance tracker. Use these tools to read their accounts, transactions, cashflow, spending categories, and top merchants so you can answer money questions with their real numbers. All data is read-only and private to this user. Always cite specific amounts and dates you used. You are not a substitute for a licensed financial advisor.";

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

function negotiateProtocol(requested: unknown): string {
  if (
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export async function handleRpcMessage(
  msg: JsonRpcRequest,
  ctx: RpcContext,
): Promise<object | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id ?? null, -32600, "Invalid Request");
  }

  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: negotiateProtocol(msg.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: SERVER_TITLE, version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return rpcResult(msg.id, {});

    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOL_DEFS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const params = msg.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      if (!name) return rpcError(msg.id, -32602, "Missing tool name");
      try {
        const result = await runTool(name, args, ctx.userId, ctx.meta);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        return rpcResult(msg.id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function handleRpc(
  body: unknown,
  ctx: RpcContext,
): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    const responses: object[] = [];
    for (const item of body) {
      const res = await handleRpcMessage(item as JsonRpcRequest, ctx);
      if (res) responses.push(res);
    }
    return responses.length ? responses : null;
  }
  return handleRpcMessage(body as JsonRpcRequest, ctx);
}
