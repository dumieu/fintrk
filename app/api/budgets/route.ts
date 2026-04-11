import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { budgets, transactions } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { createBudgetSchema } from "@/lib/validations/budget";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" } as const;

function currentPeriodRange(period: string) {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case "weekly": {
      const day = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      break;
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = new Date(now.getFullYear(), q * 3 + 3, 0);
      break;
    }
    case "yearly": {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
  }

  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const userBudgets = await resilientQuery(() =>
      db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.isActive, true))),
    );

    const results = await Promise.all(
      userBudgets.map(async (budget) => {
        const range = currentPeriodRange(budget.period);
        const conditions = [
          eq(transactions.userId, userId),
          gte(transactions.postedDate, range.start),
          lte(transactions.postedDate, range.end),
          sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
        ];

        if (budget.categoryId) {
          conditions.push(eq(transactions.categoryId, budget.categoryId));
        }

        const [result] = await resilientQuery(() =>
          db.select({
            spent: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
          }).from(transactions).where(and(...conditions)),
        );

        return {
          ...budget,
          spent: parseFloat(result?.spent ?? "0"),
          categoryName: null as string | null,
        };
      }),
    );

    return NextResponse.json({ data: results }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/budgets/GET", err);
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = createBudgetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400, headers: NO_STORE });
    }

    const [created] = await resilientQuery(() =>
      db.insert(budgets).values({
        userId,
        name: parsed.data.name,
        amount: parsed.data.amount.toString(),
        currency: parsed.data.currency,
        period: parsed.data.period,
        categoryId: parsed.data.categoryId ?? null,
        rollover: parsed.data.rollover,
        alertThreshold: parsed.data.alertThreshold.toString(),
      }).returning(),
    );

    return NextResponse.json({ data: created }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logServerError("api/budgets/POST", err);
    return NextResponse.json({ error: "Failed to create budget" }, { status: 500, headers: NO_STORE });
  }
}
