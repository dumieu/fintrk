#!/usr/bin/env node
/**
 * Smoke-test FinTRK MCP tools via JSON-RPC.
 *
 * Usage:
 *   FINTRK_MCP_PAT=ftk_pat_... FINTRK_MCP_URL=http://localhost:3000/api/mcp node scripts/test-mcp-tools.mjs
 */

const PAT = process.env.FINTRK_MCP_PAT;
const BASE = process.env.FINTRK_MCP_URL ?? "http://localhost:3000/api/mcp";

if (!PAT) {
  console.error("Set FINTRK_MCP_PAT to a dashboard personal access token.");
  process.exit(1);
}

let rpcId = 1;

async function rpc(method, params) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.error) {
    throw new Error(`${method} RPC error: ${json.error.message}`);
  }
  return json.result;
}

async function callTool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result?.isError) {
    throw new Error(`${name} tool error: ${result.content?.[0]?.text}`);
  }
  const text = result?.content?.[0]?.text;
  return text ? JSON.parse(text) : result?.structuredContent;
}

async function main() {
  console.log("MCP endpoint:", BASE);

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test-script", version: "1.0.0" },
  });
  console.log("Server:", init.serverInfo?.name, init.serverInfo?.version);
  console.log("Instructions length:", init.instructions?.length ?? 0);

  const list = await rpc("tools/list", {});
  const names = (list.tools ?? []).map((t) => t.name);
  console.log(`tools/list: ${names.length} tools`);

  const required = [
    "get_context_brief",
    "list_transactions",
    "get_cashflow_sankey",
    "get_net_worth_summary",
    "list_recurring_charges",
  ];
  for (const t of required) {
    if (!names.includes(t)) throw new Error(`Missing tool: ${t}`);
  }

  const brief = await callTool("get_context_brief");
  console.log("get_context_brief:", brief.llm_context?.summary_sentence);
  console.log("  scope:", brief.metadata?.scope);
  console.log("  follow-ups:", brief.llm_context?.suggested_follow_ups?.join(", "));

  const cashflow = await callTool("get_cashflow_summary", { months: 6 });
  console.log("get_cashflow_summary gap:", cashflow.data?.gap);

  const categories = await callTool("list_categories");
  console.log("list_categories:", categories.data?.count);

  console.log("OK - MCP smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
