/**
 * Net-worth balance sheet + projection settings.
 *
 *   GET    /api/net-worth          -> { items, settings }
 *   PUT    /api/net-worth          -> { settings }                (upsert settings)
 *   POST   /api/net-worth/items    -> { item }                    (handled in items/route.ts)
 *   PATCH  /api/net-worth/items    -> { item }                    (bulk-replace, see items/route.ts)
 */
import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { netWorthItems, netWorthSettings } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const settingsSchema = z.object({
  currency: z.string().length(3).default("USD"),
  defaultGrowthRate: z.number().min(-1).max(2).default(0.1),
  monthlyContribution: z.number().min(0).max(1_000_000).default(0),
  monthlyContributionPost: z.number().min(0).max(1_000_000).default(0),
  inflationRate: z.number().min(-0.5).max(1).default(0.03),
  currentAge: z.number().int().min(0).max(120).default(35),
  retirementAge: z.number().int().min(1).max(120).default(65),
  birthMonth: z.number().int().min(1).max(12).nullable().default(null),
  birthYear: z.number().int().min(1900).max(2100).nullable().default(null),
  annualDrawdown: z.number().min(0).max(100_000_000).default(0),
  annualDrawdownPre: z.number().min(0).max(100_000_000).default(0),
  showInflationAdjusted: z.boolean().default(false),
});

const DEFAULTS = settingsSchema.parse({
  currency: "USD",
  defaultGrowthRate: 0.1,
  monthlyContribution: 1500,
  monthlyContributionPost: 0,
  inflationRate: 0.03,
  currentAge: 35,
  retirementAge: 65,
  birthMonth: null,
  birthYear: null,
  annualDrawdown: 60_000,
  annualDrawdownPre: 0,
  showInflationAdjusted: false,
});

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const [items, settingsRow] = await Promise.all([
      resilientQuery(() =>
        db
          .select()
          .from(netWorthItems)
          .where(and(eq(netWorthItems.userId, userId), eq(netWorthItems.isActive, true)))
          .orderBy(asc(netWorthItems.kind), asc(netWorthItems.displayOrder), asc(netWorthItems.id)),
      ),
      resilientQuery(() =>
        db.select().from(netWorthSettings).where(eq(netWorthSettings.userId, userId)).limit(1),
      ),
    ]);

    const settings = settingsRow[0]
      ? {
          currency: settingsRow[0].currency,
          defaultGrowthRate: Number(settingsRow[0].defaultGrowthRate),
          monthlyContribution: Number(settingsRow[0].monthlyContribution),
          monthlyContributionPost: Number(settingsRow[0].monthlyContributionPost),
          inflationRate: Number(settingsRow[0].inflationRate),
          currentAge: settingsRow[0].currentAge,
          retirementAge: settingsRow[0].retirementAge,
          birthMonth: settingsRow[0].birthMonth,
          birthYear: settingsRow[0].birthYear,
          annualDrawdown: Number(settingsRow[0].annualDrawdown),
          annualDrawdownPre: Number(settingsRow[0].annualDrawdownPre),
          showInflationAdjusted: settingsRow[0].showInflationAdjusted,
        }
      : DEFAULTS;

    return NextResponse.json(
      {
        items: items.map((it) => ({
          id: it.id,
          kind: it.kind,
          category: it.category,
          label: it.label,
          amount: Number(it.amount),
          currency: it.currency,
          growthRate: it.growthRate == null ? null : Number(it.growthRate),
          notes: it.notes,
          displayOrder: it.displayOrder,
        })),
        settings,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/net-worth GET", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = settingsSchema.parse(body);

    if (parsed.retirementAge < parsed.currentAge) {
      return NextResponse.json(
        { error: "retirementAge must be ≥ currentAge" },
        { status: 400, headers: NO_STORE },
      );
    }

    const row = {
      currency: parsed.currency,
      defaultGrowthRate: parsed.defaultGrowthRate.toFixed(4),
      monthlyContribution: parsed.monthlyContribution.toFixed(2),
      monthlyContributionPost: parsed.monthlyContributionPost.toFixed(2),
      inflationRate: parsed.inflationRate.toFixed(4),
      currentAge: parsed.currentAge,
      retirementAge: parsed.retirementAge,
      birthMonth: parsed.birthMonth,
      birthYear: parsed.birthYear,
      annualDrawdown: parsed.annualDrawdown.toFixed(2),
      annualDrawdownPre: parsed.annualDrawdownPre.toFixed(2),
      showInflationAdjusted: parsed.showInflationAdjusted,
      updatedAt: new Date(),
    } as const;
    await resilientQuery(() =>
      db
        .insert(netWorthSettings)
        .values({ userId, ...row })
        .onConflictDoUpdate({ target: netWorthSettings.userId, set: row }),
    );

    return NextResponse.json({ settings: parsed }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400, headers: NO_STORE });
    }
    logServerError("api/net-worth PUT", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500, headers: NO_STORE });
  }
}
