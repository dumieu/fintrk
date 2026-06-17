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
import { ef, df } from "@/lib/crypto/encryption";

/** Decrypt an encrypted numeric/text field back into a number (or null). */
function dfNum(val: string | null | undefined): number | null {
  const plain = df(val);
  if (plain == null || plain === "") return null;
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

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
  annualIncome: z.number().min(0).max(100_000_000).default(0),
  incomeGrowthRate: z.number().min(-0.5).max(1).default(0.03),
  postRetirementIncome: z.number().min(0).max(100_000_000).default(0),
  postRetirementIncomeStartAge: z.number().int().min(30).max(100).default(67),
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
  annualIncome: 90_000,
  incomeGrowthRate: 0.03,
  postRetirementIncome: 24_000,
  postRetirementIncomeStartAge: 67,
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
          birthMonth: dfNum(settingsRow[0].birthMonth),
          birthYear: dfNum(settingsRow[0].birthYear),
          annualDrawdown: Number(settingsRow[0].annualDrawdown),
          annualDrawdownPre: Number(settingsRow[0].annualDrawdownPre),
          showInflationAdjusted: settingsRow[0].showInflationAdjusted,
          annualIncome: dfNum(settingsRow[0].annualIncome) ?? 0,
          incomeGrowthRate: Number(settingsRow[0].incomeGrowthRate ?? 0.03),
          postRetirementIncome: Number(settingsRow[0].postRetirementIncome ?? 0),
          postRetirementIncomeStartAge: settingsRow[0].postRetirementIncomeStartAge ?? 67,
        }
      : DEFAULTS;

    return NextResponse.json(
      {
        items: items.map((it) => ({
          id: it.id,
          kind: it.kind,
          category: it.category,
          label: df(it.label) ?? "",
          amount: Number(it.amount),
          currency: it.currency,
          growthRate: it.growthRate == null ? null : Number(it.growthRate),
          notes: df(it.notes),
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
      // PII / financial - encrypted at rest.
      birthMonth: ef(parsed.birthMonth == null ? null : String(parsed.birthMonth)),
      birthYear: ef(parsed.birthYear == null ? null : String(parsed.birthYear)),
      annualDrawdown: parsed.annualDrawdown.toFixed(2),
      annualDrawdownPre: parsed.annualDrawdownPre.toFixed(2),
      showInflationAdjusted: parsed.showInflationAdjusted,
      annualIncome: ef(parsed.annualIncome.toFixed(2)),
      incomeGrowthRate: parsed.incomeGrowthRate.toFixed(4),
      postRetirementIncome: parsed.postRetirementIncome.toFixed(2),
      postRetirementIncomeStartAge: parsed.postRetirementIncomeStartAge,
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
