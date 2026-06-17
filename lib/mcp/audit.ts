import "server-only";
import { rawSql } from "@/lib/db";
import type { ToolMeta } from "@/lib/mcp/context";

let _auditReady = false;

async function ensureAuditTable(): Promise<void> {
  if (_auditReady) return;
  await rawSql`
    CREATE TABLE IF NOT EXISTS mcp_access_log (
      id_access INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      clerk_user_id VARCHAR(255) NOT NULL,
      tool_name VARCHAR(128) NOT NULL,
      ip_address VARCHAR(64),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await rawSql`
    CREATE INDEX IF NOT EXISTS mcp_access_log_user_idx ON mcp_access_log (clerk_user_id, created_at DESC)
  `;
  _auditReady = true;
}

/** Best-effort MCP access audit; never blocks tool execution. */
export async function logMcpAccess(
  userId: string,
  meta: ToolMeta,
  toolName: string,
): Promise<void> {
  try {
    await ensureAuditTable();
    await rawSql`
      INSERT INTO mcp_access_log (clerk_user_id, tool_name, ip_address, user_agent)
      VALUES (${userId}, ${toolName}, ${meta.ipAddress}, ${meta.userAgent})
    `;
  } catch {
    // Audit failure must not break MCP reads.
  }
}
