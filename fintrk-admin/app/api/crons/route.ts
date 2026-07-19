import { NextResponse } from "next/server";

import { CRON_DESCRIPTIONS, CRON_REGISTRY } from "@/lib/cron-registry";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

interface VercelCronDef {
  host: string;
  path: string;
  schedule: string;
}

interface VercelCronsPayload {
  enabledAt: number;
  updatedAt: number;
  deploymentId: string | null;
  definitions: VercelCronDef[];
}

export interface CronItem {
  id: string;
  app: string;
  path: string;
  schedule: string;
  host: string;
  description: string;
  enabledAt: string | null;
  updatedAt: string | null;
  deploymentId: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastSummary: Record<string, unknown> | null;
  lastFailureAt: string | null;
  failureDurationMs: number | null;
  failureSummary: Record<string, unknown> | null;
}

interface CronRunRow {
  cron_path: string;
  last_success_at: string;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  last_failure_at: string | null;
  failure_duration_ms: number | null;
  failure_summary: Record<string, unknown> | null;
}

async function fetchProjectCrons(
  projectId: string,
  token: string,
  teamId?: string
): Promise<VercelCronsPayload | null> {
  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);
  const url = `https://api.vercel.com/v9/projects/${projectId}?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // redirect: "manual" so a 3xx cannot forward the Vercel token off-origin.
    redirect: "manual",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.crons ?? null;
}

async function fetchCronRuns(): Promise<Map<string, CronRunRow>> {
  try {
    const rows = await sql`
      SELECT cron_path, last_success_at, duration_ms, summary,
             last_failure_at, failure_duration_ms, failure_summary
      FROM cron_runs
    `;
    const map = new Map<string, CronRunRow>();
    for (const row of rows) {
      map.set(row.cron_path as string, row as unknown as CronRunRow);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const cronRuns = await fetchCronRuns();
  const items: CronItem[] = [];

  const vercelByPath = new Map<
    string,
    { def: VercelCronDef; cronsPayload: VercelCronsPayload }
  >();
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const userProjectId = process.env.VERCEL_PROJECT_USER_APP_ID?.trim();

  if (token && userProjectId) {
    try {
      const crons = await fetchProjectCrons(userProjectId, token, teamId);
      if (crons?.definitions?.length) {
        for (const def of crons.definitions) {
          vercelByPath.set(def.path, { def, cronsPayload: crons });
        }
      }
    } catch (err) {
      console.error("[crons] Failed to fetch Vercel crons:", err);
    }
  }

  for (const entry of CRON_REGISTRY) {
    const id = `${entry.app.toLowerCase().replace(/\s/g, "-")}-${entry.path
      .replace(/^\/api\/cron\//, "")
      .replace(/\//g, "-")}`;
    const vercel = vercelByPath.get(entry.path);
    const run = cronRuns.get(entry.path);

    items.push({
      id,
      app: entry.app,
      path: entry.path,
      schedule: vercel?.def.schedule ?? entry.schedule,
      host: vercel?.def.host ?? "-",
      description: CRON_DESCRIPTIONS[entry.path] ?? "",
      enabledAt: vercel?.cronsPayload.enabledAt
        ? new Date(vercel.cronsPayload.enabledAt).toISOString()
        : null,
      updatedAt: vercel?.cronsPayload.updatedAt
        ? new Date(vercel.cronsPayload.updatedAt).toISOString()
        : null,
      deploymentId: vercel?.cronsPayload.deploymentId ?? null,
      lastSuccessAt: run?.last_success_at
        ? new Date(run.last_success_at).toISOString()
        : null,
      lastDurationMs: run?.duration_ms ?? null,
      lastSummary: run?.summary ?? null,
      lastFailureAt: run?.last_failure_at
        ? new Date(run.last_failure_at).toISOString()
        : null,
      failureDurationMs: run?.failure_duration_ms ?? null,
      failureSummary: run?.failure_summary ?? null,
    });
  }

  return NextResponse.json(items, {
    headers: { "Cache-Control": "no-store" },
  });
}
