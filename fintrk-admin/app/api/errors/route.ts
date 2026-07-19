import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { ensureErrorLogsTable } from "@/lib/ensure-error-logs";
import { explainError } from "@/lib/error-explanations";
import { phiTextForAdminResponse } from "@/lib/crypto/phi-response";
import { getActiveDecryptionSession, trackSessionAccess } from "@/lib/decryption-session";

export const dynamic = "force-dynamic";

interface RawError {
  source: "statement" | "file_upload" | "error_log";
  id: string;
  context: string;
  message: string;
  code: string | null;
  severity: string;
  pathname: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedComment: string | null;
  user: {
    clerkUserId: string | null;
    name: string;
    email: string | null;
    imageUrl: string | null;
  } | null;
}

function adminUserJoin(
  r: Record<string, unknown>,
  clerkKey: "user_id" | "clerk_user_id",
  canDecrypt: boolean,
): RawError["user"] {
  const clerkUserId = r[clerkKey] as string | null | undefined;
  if (!clerkUserId) return null;
  const email = phiTextForAdminResponse(
    r.primary_email as string | null | undefined,
    canDecrypt,
  );
  const first = phiTextForAdminResponse(
    r.first_name as string | null | undefined,
    canDecrypt,
  );
  const last = phiTextForAdminResponse(
    r.last_name as string | null | undefined,
    canDecrypt,
  );
  const name = [first, last].filter(Boolean).join(" ").trim() || email || "Unknown";
  return {
    clerkUserId,
    name,
    email,
    imageUrl: phiTextForAdminResponse(
      r.image_url as string | null | undefined,
      canDecrypt,
    ),
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  await ensureErrorLogsTable().catch((e) => {
    console.error("ensureErrorLogsTable failed:", e);
  });

  try {
    const session = await getActiveDecryptionSession({
      email: gate.email,
      userId: gate.userId,
    });
    const canDecrypt = Boolean(session);
    if (session) {
      await trackSessionAccess(session.id, "users");
    }

    const [statementErrs, uploadErrs, logErrs] = await Promise.all([
      sql`
        SELECT
          s.id,
          s.user_id,
          s.file_name,
          s.status,
          s.ai_model,
          s.ai_error,
          s.created_at,
          s.ai_processed_at,
          u.primary_email,
          u.first_name,
          u.last_name,
          u.image_url
        FROM statements s
        LEFT JOIN users u ON u.clerk_user_id = s.user_id
        WHERE (s.status = 'failed' OR s.ai_error IS NOT NULL)
          AND s.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY s.created_at DESC
        LIMIT 300
      `,

      sql`
        SELECT
          f.id,
          f.user_id,
          f.file_name,
          f.file_size,
          f.outcome,
          f.created_at,
          u.primary_email,
          u.first_name,
          u.last_name,
          u.image_url
        FROM file_upload_log f
        LEFT JOIN users u ON u.clerk_user_id = f.user_id
        WHERE f.outcome <> 'processed'
          AND f.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY f.created_at DESC
        LIMIT 300
      `,

      sql`
        SELECT
          e.id,
          e.clerk_user_id,
          e.error_context,
          e.error_message,
          e.error_code,
          e.severity,
          e.pathname,
          e.ip_address,
          e.user_agent,
          e.metadata,
          e.created_at,
          e.resolved_at,
          e.resolved_comment,
          u.primary_email,
          u.first_name,
          u.last_name,
          u.image_url
        FROM error_logs e
        LEFT JOIN users u ON u.clerk_user_id = e.clerk_user_id
        WHERE e.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY e.created_at DESC
        LIMIT 500
      `,
    ]);

    const items: RawError[] = [];

    for (const r of statementErrs as Record<string, unknown>[]) {
      const rawAi = (r.ai_error as string) || null;
      const aiPlain = phiTextForAdminResponse(rawAi, canDecrypt);
      const message = (
        aiPlain ||
        (rawAi && !canDecrypt
          ? `Statement processing failed (status=${r.status}; error encrypted)`
          : `Statement processing failed (status=${r.status})`)
      ).slice(0, 4000);
      items.push({
        source: "statement",
        id: `statement:${r.id}`,
        context: "ingest:statement",
        message,
        code: (r.status as string) ?? null,
        severity: r.status === "failed" ? "high" : "medium",
        pathname: "/dashboard/upload",
        metadata: { statementId: r.id, fileName: r.file_name, model: r.ai_model },
        createdAt: r.created_at as string,
        resolvedAt: null,
        resolvedComment: null,
        user: adminUserJoin(r, "user_id", canDecrypt),
      });
    }

    for (const r of uploadErrs as Record<string, unknown>[]) {
      items.push({
        source: "file_upload",
        id: `upload:${r.id}`,
        context: "ingest:file_upload",
        message: `Upload outcome "${r.outcome}" for ${r.file_name}`,
        code: (r.outcome as string) ?? null,
        severity: r.outcome === "duplicate" ? "low" : "medium",
        pathname: "/dashboard/upload",
        metadata: { uploadLogId: r.id, fileSize: r.file_size },
        createdAt: r.created_at as string,
        resolvedAt: null,
        resolvedComment: null,
        user: adminUserJoin(r, "user_id", canDecrypt),
      });
    }

    for (const r of logErrs as Record<string, unknown>[]) {
      items.push({
        source: "error_log",
        id: `log:${r.id}`,
        context: (r.error_context as string) ?? "unknown",
        message: (r.error_message as string) ?? "(no message)",
        code: (r.error_code as string) ?? null,
        severity: (r.severity as string) ?? "medium",
        pathname: (r.pathname as string) ?? null,
        metadata: (r.metadata as Record<string, unknown>) ?? null,
        createdAt: r.created_at as string,
        resolvedAt: (r.resolved_at as string) ?? null,
        resolvedComment: (r.resolved_comment as string) ?? null,
        user: adminUserJoin(r, "clerk_user_id", canDecrypt),
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const errorsWithExplanation = items.map((e) => ({
      ...e,
      explanation: explainError(e.context, e.message, e.code),
    }));

    const contextCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const userCounts: Record<
      string,
      { count: number; name: string; email: string | null; imageUrl: string | null }
    > = {};
    const dailyCounts: Record<string, number> = {};

    for (const e of errorsWithExplanation) {
      const titleKey = e.explanation.title;
      contextCounts[titleKey] = (contextCounts[titleKey] ?? 0) + 1;
      severityCounts[e.severity] = (severityCounts[e.severity] ?? 0) + 1;
      sourceCounts[e.source] = (sourceCounts[e.source] ?? 0) + 1;
      const day = new Date(e.createdAt).toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
      if (e.user?.clerkUserId) {
        const k = e.user.clerkUserId;
        if (!userCounts[k]) {
          userCounts[k] = {
            count: 0,
            name: e.user.name,
            email: e.user.email,
            imageUrl: e.user.imageUrl,
          };
        }
        userCounts[k].count++;
      }
    }

    // Axis in UTC to match dailyCounts keys from toISOString (avoids local/UTC skew).
    const dailyTrend = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (13 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: dailyCounts[key] ?? 0 };
    });

    const topErrors = Object.entries(contextCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topUsers = Object.entries(userCounts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      errors: errorsWithExplanation,
      decrypted: canDecrypt,
      charts: {
        topErrors,
        topUsers,
        dailyTrend,
        severityCounts: Object.entries(severityCounts).map(([name, count]) => ({
          name,
          count,
        })),
        sourceCounts: Object.entries(sourceCounts).map(([name, count]) => ({
          name,
          count,
        })),
        totalErrors: errorsWithExplanation.length,
      },
    });
  } catch (e) {
    console.error("Error monitor route:", e);
    return NextResponse.json({ error: "errors_failed" }, { status: 500 });
  }
}
