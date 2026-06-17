import "server-only";

export interface ToolMeta {
  ipAddress: string;
  userAgent: string;
}

export interface McpContext {
  userId: string;
  scope: string;
  meta: ToolMeta;
}

export function buildMcpContext(
  userId: string,
  scope: string,
  meta: ToolMeta,
): McpContext {
  return { userId, scope, meta };
}
