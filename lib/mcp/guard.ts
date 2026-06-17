import "server-only";
import { SCOPE_READ } from "@/lib/mcp/config";
import type { McpContext } from "@/lib/mcp/context";

export class McpGuardError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "McpGuardError";
  }
}

function scopeTokens(scope: string): Set<string> {
  return new Set(scope.split(/\s+/).filter(Boolean));
}

export function requireScope(ctx: McpContext, required: typeof SCOPE_READ): void {
  const tokens = scopeTokens(ctx.scope);
  if (!tokens.has(required)) {
    throw new McpGuardError(
      `Missing required scope: ${required}. Token has: ${ctx.scope || "(none)"}`,
      "INSUFFICIENT_SCOPE",
    );
  }
}

export function requireReadScope(ctx: McpContext): void {
  requireScope(ctx, SCOPE_READ);
}
