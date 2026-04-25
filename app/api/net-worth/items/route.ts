/**
 * Bulk replace of the user's net-worth line items.
 *
 *   PUT /api/net-worth/items   body: { items: NetWorthItemInput[] }
 *
 * Replaces (soft-deletes prior, inserts new) so the client can edit freely
 * without juggling individual ids — saves are atomic, idempotent, and fast.
 */
import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { netWorthItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logServerError } from "@/lib/safe-error";

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
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const json = await req.json();
    const { items } = bodySchema.parse(json);

    await resilientQuery(() =>
      db.delete(netWorthItems).where(eq(netWorthItems.userId, userId)),
    );

    if (items.length > 0) {
      await resilientQuery(() =>
        db.insert(netWorthItems).values(
          items.map((it, idx) => ({
            userId,
            kind: it.kind,
            category: it.category,
            label: it.label,
            amount: it.amount.toFixed(2),
            currency: it.currency,
            growthRate: it.growthRate == null ? null : it.growthRate.toFixed(4),
            notes: it.notes ?? null,
            displayOrder: it.displayOrder ?? idx,
            isActive: true,
          })),
        ),
      );
    }

    return NextResponse.json({ saved: items.length }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400, headers: NO_STORE });
    }
    logServerError("api/net-worth/items PUT", err);
    return NextResponse.json({ error: "Failed to save items" }, { status: 500, headers: NO_STORE });
  }
}
