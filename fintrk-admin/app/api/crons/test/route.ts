import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { CRON_REGISTRY } from "@/lib/cron-registry";

export const dynamic = "force-dynamic";

const ALLOWED_CRON_PATHS = new Set(CRON_REGISTRY.map((c) => c.path));

function getAppUrl(app: string): string | undefined {
  if (app === "User App") return process.env.USER_APP_URL?.trim() || undefined;
  return undefined;
}

/** Join base + cron path via URL so trailing paths/query on USER_APP_URL cannot skew the target. */
function buildCronTargetUrl(baseUrl: string, cronPath: string): string | null {
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") return null;
    // Reject credentials embedded in USER_APP_URL.
    if (base.username || base.password) return null;
    const target = new URL(cronPath, base.origin);
    if (target.origin !== base.origin) return null;
    if (!target.pathname.startsWith("/api/cron/")) return null;
    target.search = "";
    target.hash = "";
    return target.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "CRON_SECRET not configured on Admin App" },
      testedAt: new Date().toISOString(),
    });
  }

  let body: { app: string; path: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "Invalid JSON body" },
      testedAt: new Date().toISOString(),
    });
  }

  if (!body.app || !body.path) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "app and path are required" },
      testedAt: new Date().toISOString(),
    });
  }

  if (
    typeof body.path !== "string" ||
    !body.path.startsWith("/api/cron/") ||
    !ALLOWED_CRON_PATHS.has(body.path)
  ) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "path is not in the cron registry" },
      testedAt: new Date().toISOString(),
    });
  }

  const registryEntry = CRON_REGISTRY.find((c) => c.path === body.path);
  if (!registryEntry || body.app !== registryEntry.app) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "app does not match cron registry entry" },
      testedAt: new Date().toISOString(),
    });
  }

  const baseUrl = getAppUrl(body.app);
  if (!baseUrl) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "USER_APP_URL not configured on Admin App" },
      testedAt: new Date().toISOString(),
    });
  }

  const targetUrl = buildCronTargetUrl(baseUrl, body.path);
  if (!targetUrl) {
    return NextResponse.json({
      status: "error",
      httpStatus: 0,
      elapsed: 0,
      response: { error: "USER_APP_URL is not a valid http(s) origin" },
      testedAt: new Date().toISOString(),
    });
  }

  let lastSuccessAt: string | null = null;
  try {
    const [row] = await sql`
      SELECT last_success_at FROM cron_runs WHERE cron_path = ${body.path}
    `;
    lastSuccessAt = row?.last_success_at
      ? new Date(row.last_success_at as string).toISOString()
      : null;
  } catch {
    /* ignore */
  }

  const isLocalHttps =
    targetUrl.startsWith("https://local.") ||
    targetUrl.startsWith("https://localhost");

  if (isLocalHttps) {
    import("node:https")
      .then((https) => {
        const { URL } = require("node:url") as typeof import("node:url");
        const parsed = new URL(targetUrl);
        const req = https.get(
          {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            rejectUnauthorized: false,
            headers: { Authorization: `Bearer ${cronSecret}` },
          },
          () => {}
        );
        req.on("error", () => {});
        req.setTimeout(300_000, () => req.destroy());
      })
      .catch(() => {});
  } else {
    // redirect: "manual" so a 3xx cannot forward the Bearer CRON_SECRET off-origin.
    fetch(targetUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
      redirect: "manual",
    }).catch(() => {});
  }

  return NextResponse.json({
    status: "triggered",
    httpStatus: 0,
    elapsed: 0,
    response: { message: "Cron triggered - check status in a few minutes" },
    targetUrl,
    testedAt: new Date().toISOString(),
    previousSuccessAt: lastSuccessAt,
  });
}
