import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Upload,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  BrainCircuit,
  Wallet,
  TrendingUp,
  PieChart,
  Repeat,
  Globe,
  Target,
  ChartLine,
  ChartBar,
  Receipt,
  Coins,
  Landmark,
  PiggyBank,
  ChevronRight,
  Zap,
  Lock,
  Scan,
  Trophy,
  Calculator,
  HandCoins,
} from "lucide-react";

const CapitalFlowBackground = dynamic(
  () => import("@/components/capital-flow-background").then((m) => ({ default: m.CapitalFlowBackground })),
);

const BASE_URL = "https://fintrk.io";
const SIGN_UP_URL = "/auth/sign-up";
const SIGN_IN_URL = "/auth";

const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "FinTRK - Drop a bank statement. See where every dollar goes.",
  description:
    "Upload any bank or credit card statement. AI categorizes every transaction, surfaces hidden subscriptions, maps your cash flow, and projects your financial trajectory - in 30 seconds.",
  alternates: { canonical: `${BASE_URL}/unauth1` },
  openGraph: {
    type: "website",
    url: `${BASE_URL}/unauth1`,
    siteName: "FinTRK",
    title: "FinTRK - Your money is talking. AI is finally listening.",
    description:
      "Upload a bank statement. Get a CFO-grade breakdown of your finances in 30 seconds.",
  },
};

export default async function Unauth1() {
  let userId: string | null = null;
  if (CLERK_CONFIGURED) {
    const { auth } = await import("@clerk/nextjs/server");
    ({ userId } = await auth());
  }
  if (userId) redirect("/dashboard");

  return (
    <div className="overflow-x-hidden text-white">
      {/* ──────────────────────── Header ──────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-emerald-400/10 backdrop-blur-md"
        style={{ background: "rgba(2, 12, 14, 0.72)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="FinTRK home">
            <span
              className="font-aldhabi text-xl font-bold tracking-tight sm:text-2xl"
              style={{
                background:
                  "linear-gradient(90deg, #10E1A1 0%, #22D3EE 50%, #FCD34D 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              FinTRK
            </span>
            <span className="hidden text-xs uppercase tracking-widest text-emerald-200/60 sm:inline">
              .io
            </span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link
              href={SIGN_IN_URL}
              className="hidden text-sm text-emerald-100/70 transition-colors hover:text-white sm:inline"
            >
              Sign In
            </Link>
            <Link href={SIGN_UP_URL}>
              <Button
                size="sm"
                className="border-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-emerald-950 shadow-[0_0_24px_rgba(16,225,161,0.35)] hover:from-emerald-300 hover:via-teal-300 hover:to-cyan-300"
              >
                Get Free Account
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ────────────────────── Hero ────────────────────── */}
        <section
          className="relative min-h-[640px] overflow-hidden sm:min-h-[720px] lg:min-h-[780px]"
          style={{
            background:
              "radial-gradient(1200px 700px at 20% -10%, #003a2c 0%, transparent 60%), radial-gradient(900px 600px at 90% 10%, #002146 0%, transparent 55%), linear-gradient(180deg, #001512 0%, #00201b 50%, #001426 100%)",
          }}
          aria-labelledby="hero-heading"
        >
          <CapitalFlowBackground />

          {/* Vignette to keep text legible over the animation */}
          <div
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 50% 35%, rgba(0,21,18,0) 0%, rgba(0,21,18,0.55) 70%, rgba(0,21,18,0.85) 100%)",
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[55%]"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,21,18,0.85) 0%, rgba(0,21,18,0.4) 60%, transparent 100%)",
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-28">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-100/90 backdrop-blur-sm sm:text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                Your money is talking. AI is finally listening.
              </p>
              <h1
                id="hero-heading"
                className="text-3xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
              >
                Drop a bank statement.
                <br />
                <span
                  className="block pb-2"
                  style={{
                    fontSize: "0.78em",
                    background:
                      "linear-gradient(90deg, #10E1A1 0%, #22D3EE 35%, #FCD34D 75%, #C084FC 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    lineHeight: 1.18,
                  }}
                >
                  See where every dollar is going in 30 seconds.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-emerald-50/85 sm:text-lg">
                Upload any bank, credit card, brokerage, or crypto statement -
                PDF, CSV, Excel, screenshot. AI extracts every transaction,
                normalises 7 currencies, learns your real merchants, finds the
                subscriptions you forgot, and projects your cash flow 12 months
                forward. No bank linking. No data brokers. Just answers.
              </p>

              <div className="mt-9 flex flex-col items-center gap-4">
                <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:justify-center">
                  <Link href={SIGN_UP_URL} className="block">
                    <Button
                      size="lg"
                      className="group h-12 w-full border-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-7 text-base font-semibold text-emerald-950 shadow-[0_0_36px_rgba(16,225,161,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_56px_rgba(16,225,161,0.7)] sm:w-auto"
                    >
                      <Upload className="mr-2 h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5" aria-hidden />
                      Start Free - Upload Your First Statement
                      <ArrowRight className="ml-2 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Button>
                  </Link>
                  <Link href={SIGN_UP_URL} className="block">
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 w-full border-emerald-300/30 bg-white/[0.04] px-6 text-base font-medium text-emerald-50 backdrop-blur-sm transition-all hover:border-emerald-300/60 hover:bg-white/[0.08] hover:text-white sm:w-auto"
                    >
                      <ChartLine className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      See your money like never before
                    </Button>
                  </Link>
                </div>
                <p className="text-[11px] uppercase tracking-widest text-emerald-100/45">
                  Free forever · No credit card · Bank-grade encryption
                </p>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-8">
                {[
                  { k: "30s", v: "Statement → insights" },
                  { k: "7", v: "Currencies normalised" },
                  { k: "12mo", v: "Cash flow projected" },
                ].map((s) => (
                  <div key={s.k} className="rounded-xl border border-emerald-300/10 bg-white/[0.025] px-3 py-3 backdrop-blur-sm">
                    <div
                      className="text-xl font-bold sm:text-3xl"
                      style={{
                        background: "linear-gradient(135deg, #10E1A1 0%, #22D3EE 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {s.k}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-emerald-100/60 sm:text-xs">
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Smooth fade into next section */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, #050a12 80%, #050a12 100%)",
            }}
            aria-hidden="true"
          />
        </section>

        {/* ────────────────── Showcase Strip ────────────────── */}
        <section
          className="relative border-y border-emerald-300/10 px-4 py-10 sm:py-14"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 50%, rgba(16,225,161,0.05), transparent), #050a12",
          }}
          aria-label="Feature highlights"
        >
          <div className="mx-auto max-w-5xl">
            <p className="mb-6 text-center text-sm font-medium tracking-tight text-emerald-50/85 sm:text-base">
              From statement upload to your full financial life in{" "}
              <span
                className="font-bold"
                style={{
                  background: "linear-gradient(90deg, #10E1A1, #FCD34D)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                30 seconds
              </span>
              .
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {[
                { i: ChartBar, l: "Spending Analytics" },
                { i: PieChart, l: "Category Mind-Map" },
                { i: Repeat, l: "Recurring Detection" },
                { i: TrendingUp, l: "Cash Flow Projection" },
                { i: Globe, l: "Multi-Currency" },
                { i: Target, l: "Goals & Budgets" },
                { i: Wallet, l: "Net Worth" },
                { i: Trophy, l: "Wealth Score" },
                { i: Receipt, l: "Merchant Hierarchy" },
                { i: HandCoins, l: "Subscription Audit" },
                { i: Landmark, l: "Account Aggregation" },
                { i: PiggyBank, l: "Savings Insights" },
              ].map(({ i: Icon, l }) => (
                <div
                  key={l}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-emerald-300/10 bg-white/[0.02] px-3 py-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-300/30 hover:bg-emerald-400/[0.06]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 ring-1 ring-emerald-300/20 transition-all group-hover:ring-emerald-300/40">
                    <Icon className="h-4 w-4 text-emerald-200" aria-hidden />
                  </div>
                  <span className="text-[10.5px] font-medium leading-tight text-emerald-50/80 sm:text-[11.5px]">
                    {l}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── What AI Does ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#050a12" }}
          aria-labelledby="ai-features-heading"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 30% 0%, rgba(16,225,161,0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(34,211,238,0.06), transparent)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] sm:text-sm"
                style={{
                  background:
                    "linear-gradient(90deg, #10E1A1, #22D3EE, #FCD34D)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                This is not another budgeting app
              </p>
              <h2
                id="ai-features-heading"
                className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
              >
                One upload. Your entire financial life - decoded.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-emerald-50/70">
                Most apps make you tag every coffee. FinTRK reads your raw
                statements, understands the patterns, and tells you exactly
                where you are, where you&rsquo;re headed, and where the money
                is leaking.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Upload,
                  title: "Drop Any Statement",
                  text: "PDF, CSV, Excel, even a phone screenshot. Bank, credit card, brokerage, crypto. AI parses the layout, extracts every line, normalises dates and currencies, and de-duplicates against what's already in your account.",
                  accent: "#10E1A1",
                },
                {
                  icon: BrainCircuit,
                  title: "AI Categorisation That Learns You",
                  text: "Every transaction is auto-categorised against a living merchant graph that already knows 60,000+ merchants - and learns yours after one correction. Re-categorise once, never again.",
                  accent: "#22D3EE",
                },
                {
                  icon: Globe,
                  title: "True Multi-Currency Net Worth",
                  text: "Spend in EUR, get paid in USD, hold BTC and SGD savings? FinTRK normalises every account to one home currency in real time using FX rates, so your net worth is finally a single number you can trust.",
                  accent: "#FCD34D",
                },
                {
                  icon: Repeat,
                  title: "Hidden Subscription Radar",
                  text: "AI sniffs out every recurring charge - even ones that change name or amount each month - and tells you exactly how much of your salary is on autopilot. Most users find $400+/year they forgot they were paying.",
                  accent: "#C084FC",
                },
                {
                  icon: TrendingUp,
                  title: "12-Month Cash Flow Forecast",
                  text: "Your historical income, expenses, and recurring patterns are fed into a forecasting engine that projects your runway, savings velocity, and monthly net for the next year - updating every time a new statement lands.",
                  accent: "#10E1A1",
                },
                {
                  icon: PieChart,
                  title: "Category Mind-Map",
                  text: "An interactive constellation of where your money flows: parent → subcategory → merchant. Click any node to drill in. See the months you blew the food budget, the merchant that ate your travel category.",
                  accent: "#22D3EE",
                },
                {
                  icon: Target,
                  title: "Goals & Budgets That Adapt",
                  text: "Set savings, debt-payoff, or investment goals. FinTRK back-tests them against your real spending velocity and tells you - honestly - whether you'll hit them, and what to cut if you won't.",
                  accent: "#FCD34D",
                },
                {
                  icon: ChartLine,
                  title: "Time-Slice Anything",
                  text: "Drag any chart's time slicer - this week, this quarter, last 13 months, custom. Every KPI, sankey, and projection re-computes instantly. See exactly when your spending shifted and why.",
                  accent: "#C084FC",
                },
                {
                  icon: Trophy,
                  title: "Wealth Score & Trajectory",
                  text: "A single 0-100 score blending savings rate, debt ratio, recurring drag, diversification, and momentum - tracked over time. Watch it move as you actually take action.",
                  accent: "#10E1A1",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="group relative overflow-hidden rounded-2xl border border-emerald-300/10 bg-gradient-to-br from-white/[0.035] to-white/[0.01] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300/30 hover:shadow-[0_8px_40px_-12px_rgba(16,225,161,0.35)] sm:p-6"
                >
                  <div
                    className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(ellipse 70% 80% at 30% 0%, ${item.accent}18, transparent 70%)`,
                    }}
                    aria-hidden="true"
                  />
                  <div className="relative z-10">
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1"
                        style={{
                          backgroundColor: `${item.accent}1A`,
                          boxShadow: `0 0 20px ${item.accent}22`,
                        }}
                      >
                        <item.icon
                          className="h-5 w-5"
                          style={{ color: item.accent }}
                          aria-hidden
                        />
                      </div>
                      <h3 className="text-sm font-bold tracking-tight text-white sm:text-base">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-[13px] leading-relaxed text-emerald-50/70">
                      {item.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-14 flex justify-center">
              <Link href={SIGN_UP_URL}>
                <Button
                  size="lg"
                  className="group h-12 border-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-7 text-base font-semibold text-emerald-950 shadow-[0_0_36px_rgba(16,225,161,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_56px_rgba(16,225,161,0.65)]"
                >
                  See It With Your Own Statement
                  <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ────────────────── How It Works ────────────────── */}
        <section
          className="relative px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#040810" }}
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2
                id="how-heading"
                className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
              >
                Three steps. Zero spreadsheets.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-emerald-50/70">
                From a raw statement to a complete financial operating system
                in under a minute.
              </p>
            </div>
            <div className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
              {/* Decorative connecting line on desktop */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px md:block"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(16,225,161,0.4) 20%, rgba(34,211,238,0.4) 50%, rgba(252,211,77,0.4) 80%, transparent 100%)",
                }}
                aria-hidden="true"
              />
              {[
                {
                  step: "01",
                  title: "Upload",
                  text: "Drop a PDF, CSV, Excel, or screenshot from any bank, card, brokerage, or wallet. AI parses the layout - even messy ones - in seconds.",
                  icon: Upload,
                  color: "#10E1A1",
                },
                {
                  step: "02",
                  title: "Understand",
                  text: "Every transaction is categorised, every recurring charge surfaced, every currency normalised. KPIs, sankey, mind-map, projections - all built automatically.",
                  icon: BrainCircuit,
                  color: "#22D3EE",
                },
                {
                  step: "03",
                  title: "Optimise",
                  text: "FinTRK tells you exactly which subscriptions to cancel, which categories to cap, where you're leaking, and whether your savings goals are actually achievable.",
                  icon: Target,
                  color: "#FCD34D",
                },
              ].map((item) => (
                <div key={item.step} className="relative text-center">
                  <div
                    className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#040810] ring-2"
                    style={{
                      boxShadow: `0 0 32px ${item.color}40`,
                      borderColor: `${item.color}50`,
                      backgroundColor: "#040810",
                    }}
                  >
                    <item.icon
                      className="h-6 w-6"
                      style={{ color: item.color }}
                      aria-hidden
                    />
                  </div>
                  <p
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
                    style={{
                      background: `linear-gradient(90deg, ${item.color}, #FCD34D)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Step {item.step}
                  </p>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/65">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── The Difference ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#03070d" }}
          aria-labelledby="difference-heading"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(34,211,238,0.06), transparent)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="mx-auto w-full text-center">
              <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 ring-1 ring-emerald-300/30 sm:h-24 sm:w-24">
                <Coins className="h-10 w-10 text-amber-300 sm:h-12 sm:w-12" aria-hidden />
              </div>
              <h2
                id="difference-heading"
                className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
              >
                Everyone else gives you a number.
                <br />
                FinTRK gives you the why.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-emerald-50/70">
                Other apps tell you what you spent. FinTRK tells you what
                that spending pattern means, what it&rsquo;s costing your
                future self, and exactly which lever to pull this week to
                change the trajectory.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Scan,
                  title: "Reads Anything",
                  text: "PDF, CSV, Excel, screenshots. Any bank, any card, any country, any layout - even ones that change every month. No bank linking required.",
                },
                {
                  icon: BrainCircuit,
                  title: "AI That Connects Dots",
                  text: "Spending up while income flat? Subscription charges quietly creeping? Forex fees draining you? AI catches the pattern, names it, and recommends what to do.",
                },
                {
                  icon: Calculator,
                  title: "Forecast + Goal Engine",
                  text: "Set a goal. FinTRK back-tests it against your real spending and tells you - to the dollar - whether you'll hit it, and which categories to trim if you won't.",
                },
                {
                  icon: ShieldCheck,
                  title: "Bank-Grade. Period.",
                  text: "Encrypted at rest, encrypted in transit, never sold, never linked to a data broker, never trained on. Your statements are yours - we just process them.",
                },
              ].map((item) => (
                <div key={item.title} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-300/20">
                      <item.icon className="h-5 w-5 text-emerald-300" aria-hidden />
                    </div>
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-emerald-50/65">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── Trust & Compliance ────────────────── */}
        <section
          className="border-y border-emerald-300/10 px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#040810" }}
          aria-labelledby="trust-heading"
        >
          <div className="mx-auto max-w-6xl text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 ring-1 ring-emerald-300/30">
              <Lock className="h-6 w-6 text-emerald-300" aria-hidden />
            </div>
            <h2
              id="trust-heading"
              className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
            >
              Your money data deserves better than &ldquo;trust us&rdquo;.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-emerald-50/70">
              No screen-scraping. No Plaid permissions. No sharing your bank
              login with third parties. You upload statements you already have,
              and we process them with the same encryption banks use.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-5 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-300/15 bg-white/[0.03] p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-300/30">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-white">Bank-Grade Encryption</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-50/65">
                  AES-256 encryption at rest, TLS 1.3 in transit. Statements
                  are processed in isolated containers and the raw files can
                  be wiped any time from a single setting.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-300/15 bg-white/[0.03] p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 ring-1 ring-cyan-300/30">
                  <Zap className="h-4 w-4 text-cyan-300" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-white">No Bank Linking</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-50/65">
                  We don&rsquo;t touch your online banking credentials. No
                  Plaid, no Yodlee, no third-party aggregator. You choose what
                  to upload, you control what we see.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-300/15 bg-white/[0.03] p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 ring-1 ring-amber-300/30">
                  <HandCoins className="h-4 w-4 text-amber-300" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-white">Never Sold. Never Trained On.</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-50/65">
                  Your transactions are not a product. They&rsquo;re not sold
                  to data brokers, never used to train models, never shared
                  with advertisers. Delete your account and they&rsquo;re gone.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────── Final CTA ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(16,225,161,0.10), transparent), radial-gradient(ellipse 60% 50% at 30% 60%, rgba(192,132,252,0.06), transparent), #030609",
          }}
          aria-labelledby="cta-heading"
        >
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <p
              className="mb-3 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm"
              style={{
                background: "linear-gradient(90deg, #10E1A1, #22D3EE, #FCD34D)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your statements already have the answers
            </p>
            <h2
              id="cta-heading"
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              Stop guessing.
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(90deg, #10E1A1 0%, #22D3EE 50%, #FCD34D 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Start owning your money.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-emerald-50/75">
              Upload a statement you already have. In 30 seconds you&rsquo;ll
              see what an army of analysts would charge you thousands for -
              and at least 5 things your bank app will never tell you.
              Categories, recurring drag, currency exposure, projected runway,
              wealth score, and a clear roadmap to a richer next year.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={SIGN_UP_URL}>
                <Button
                  size="lg"
                  className="group h-12 w-full border-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-8 text-base font-semibold text-emerald-950 shadow-[0_0_44px_rgba(16,225,161,0.5)] transition-all hover:scale-[1.02] hover:shadow-[0_0_64px_rgba(16,225,161,0.75)] sm:w-auto"
                >
                  Create Your Free Account
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href={SIGN_IN_URL}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full border-emerald-300/30 bg-white/[0.04] px-7 text-base font-medium text-emerald-50 hover:border-emerald-300/60 hover:bg-white/[0.08] hover:text-white sm:w-auto"
                >
                  I already have an account
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-widest text-emerald-100/45">
              No credit card · Free forever tier · Encrypted from upload to delete
            </p>
          </div>
        </section>

      </main>
    </div>
  );
}
