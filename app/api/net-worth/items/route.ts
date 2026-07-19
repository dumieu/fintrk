/**
 * Bulk replace of the user's net-worth line items.
 *
 *   PUT /api/net-worth/items   body: { items: NetWorthItemInput[] }
 *
 * Replaces prior rows in one Neon transaction so a failed insert cannot leave
 * the balance sheet empty after delete.
 */
import { NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { rawSql } from "@/lib/db";
import { z } from "zod";
import { logServerError } from "@/lib/safe-error";
import { ef } from "@/lib/crypto/encryption";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const itemSchema = z.object({
  kind: z.enum(["asset", "liability"]),
  category: z.string().min(1).max(32).default("other"),
  label: z.string().min(1).max(128),
  amount: z.number().min(0).max(1_000_000_000_000),
  currency: z.string().length(3).default("USD"),
  growthRate: z.number().min(-1).max(2).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10000).default(0),
});

const bodySchema = z.object({ items: z.array(itemSchema).max(200) });

export async function PUT(req: Request) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const json = await req.json();
    const { items } = bodySchema.parse(json);

    const steps: { query: string; params: unknown[] }[] = [
      {
        query: `DELETE FROM net_worth_items WHERE user_id = $1`,
        params: [userId],
      },
    ];

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]!;
      const label = ef(it.label) ?? it.label;
      const notes = ef(it.notes ?? null);
      steps.push({
        query: `INSERT INTO net_worth_items
          (user_id, kind, category, label, amount, currency, growth_rate, notes, display_order, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        params: [
          userId,
          it.kind,
          it.category,
          label,
          it.amount.toFixed(2),
          it.currency,
          it.growthRate == null ? null : it.growthRate.toFixed(4),
          notes,
          it.displayOrder ?? idx,
        ],
      });
    }

    await rawSql.transaction((txn) => steps.map((s) => txn.query(s.query, s.params)));

    return NextResponse.json({ saved: items.length }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400, headers: NO_STORE });
    }
    logServerError("api/net-worth/items PUT", err);
    return NextResponse.json({ error: "Failed to save items" }, { status: 500, headers: NO_STORE });
  }
}
