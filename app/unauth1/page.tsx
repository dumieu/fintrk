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
  Target,
  LineChart,
  Layers,
  Flag,
  Activity,
  Lock,
  Network,
  Waves,
  BarChart3,
  Landmark,
  ChevronRight,
  Gauge,
  Bot,
  Coins,
} from "lucide-react";

import { AiConnectBand } from "@/components/ai-connect-band";

const CapitalFlowBackground = dynamic(
  () => import("@/components/capital-flow-background").then((m) => ({ default: m.CapitalFlowBackground })),
);

const BASE_URL = "https://fintrk.io";
const SIGN_UP_URL = "/auth/sign-up";
const SIGN_IN_URL = "/auth";

const GREEN = "#0BC18D";
const BLUE = "#2CA2FF";
const PURPLE = "#AD74FF";
const GOLD = "#ECAA0B";
const CORAL = "#FF6F69";

const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "FinTRK - Track every dollar. Project your entire financial future.",
  description:
    "The financial command center for your household. Upload your statements and FinTRK organizes your cashflow, spending, and net worth, then projects your wealth, retirement, and financial independence decades ahead.",
  alternates: { canonical: `${BASE_URL}/unauth1` },
  openGraph: {
    type: "website",
    url: `${BASE_URL}/unauth1`,
    siteName: "FinTRK",
    title: "FinTRK - Track every dollar. Project your entire financial future.",
    description:
      "Budgeting, financial tracking, and retirement planning in one place. Upload a statement, see your whole financial life, then model your future to age 100.",
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
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md"
        style={{ background: "rgba(3, 10, 14, 0.74)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="FinTRK home">
            <span
              className="font-aldhabi text-xl font-bold tracking-tight sm:text-2xl"
              style={{
                background: `linear-gradient(90deg, ${GREEN} 0%, ${BLUE} 55%, ${PURPLE} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              FinTRK
            </span>
            <span className="hidden text-xs uppercase tracking-widest text-emerald-200/50 sm:inline">.io</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link
              href={SIGN_IN_URL}
              className="hidden text-sm text-white/65 transition-colors hover:text-white sm:inline"
            >
              Sign In
            </Link>
            <Link href={SIGN_UP_URL}>
              <Button
                size="sm"
                className="border-0 text-emerald-950 shadow-[0_0_24px_rgba(11,193,141,0.35)] hover:opacity-95"
                style={{ background: `linear-gradient(90deg, ${GREEN}, ${BLUE})` }}
              >
                Get Started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ────────────────────── Hero ────────────────────── */}
        <section
          className="relative min-h-[680px] overflow-hidden sm:min-h-[760px] lg:min-h-[820px]"
          style={{
            background:
              "radial-gradient(1200px 720px at 18% -10%, #013a2c 0%, transparent 60%), radial-gradient(950px 620px at 88% 6%, #0a1f47 0%, transparent 55%), radial-gradient(800px 600px at 60% 110%, #1a1140 0%, transparent 55%), linear-gradient(180deg, #02110d 0%, #051a18 48%, #04101f 100%)",
          }}
          aria-labelledby="hero-heading"
        >
          <CapitalFlowBackground />
          <div
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 50% 34%, rgba(2,17,13,0) 0%, rgba(2,17,13,0.55) 70%, rgba(2,17,13,0.86) 100%)",
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[52%]"
            style={{
              background:
                "linear-gradient(180deg, rgba(2,17,13,0.82) 0%, rgba(2,17,13,0.38) 60%, transparent 100%)",
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-20 lg:pb-24 lg:pt-24">
            <div className="mx-auto max-w-5xl text-center">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm sm:text-xs">
                <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
                Budgeting, tracking &amp; retirement planning in one place
              </p>
              <h1
                id="hero-heading"
                className="mx-auto max-w-4xl text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.85rem]"
              >
                See where every dollar goes
                <span className="block pt-2">
                  <span
                    style={{
                      background: `linear-gradient(90deg, ${GREEN} 0%, ${BLUE} 45%, ${PURPLE} 78%, ${GOLD} 100%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    and exactly where it takes you.
                  </span>
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
                FinTRK turns the statements you already have into your household&rsquo;s
                complete financial picture: cashflow, spending, and net worth, organized
                automatically. Then the Net Worth Atlas projects your wealth, retirement,
                and financial independence to age 100, and shows you which moves change
                the outcome. No bank logins. No spreadsheets.
              </p>

              <div className="mt-9 flex justify-center">
                <Link href={SIGN_UP_URL} className="block">
                  <Button
                    size="lg"
                    className="group h-12 w-full border-0 px-7 text-base font-semibold text-emerald-950 shadow-[0_0_36px_rgba(11,193,141,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_56px_rgba(11,193,141,0.7)] sm:w-auto"
                    style={{ background: `linear-gradient(90deg, ${GREEN}, ${BLUE})` }}
                  >
                    <Upload className="mr-2 h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5" aria-hidden />
                    Upload Your First Statement
                    <ArrowRight className="ml-2 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-widest text-white/40">
                Private by design · Encrypted at rest · Your data stays yours
              </p>

              <AiConnectBand />

              <div className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-3 sm:gap-6">
                {[
                  { k: "30s", v: "Statement to organized", c: GREEN },
                  { k: "Age 100", v: "Every plan projected to", c: BLUE },
                  { k: "400", v: "Market simulations per plan", c: PURPLE },
                ].map((s) => (
                  <div
                    key={s.k}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 backdrop-blur-sm"
                  >
                    <div
                      className="text-xl font-bold sm:text-3xl"
                      style={{
                        background: `linear-gradient(135deg, ${s.c}, ${BLUE})`,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {s.k}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-white/55 sm:text-xs">
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32"
            style={{ background: "linear-gradient(180deg, transparent 0%, #050a12 82%, #050a12 100%)" }}
            aria-hidden="true"
          />
        </section>

        {/* ────────────────── Three Pillars ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#050a12" }}
          aria-labelledby="pillars-heading"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 25% 0%, rgba(11,193,141,0.08), transparent), radial-gradient(ellipse 60% 45% at 85% 100%, rgba(173,116,255,0.07), transparent)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] sm:text-sm"
                style={{
                  background: `linear-gradient(90deg, ${GREEN}, ${BLUE}, ${PURPLE})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                One platform. Three jobs done.
              </p>
              <h2 id="pillars-heading" className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                Track. Understand. Project.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-white/65">
                Most apps stop at last month&rsquo;s spending. FinTRK takes you from
                a raw statement all the way to a defensible plan for the next 40 years.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {[
                {
                  n: "01",
                  icon: BarChart3,
                  color: GREEN,
                  title: "Track everything, effortlessly",
                  text: "Upload statements from any bank, card, brokerage, or wallet. AI extracts every transaction, categorizes it, and de-duplicates against what you already have. Each account keeps its own currency and rolls up to one home-currency net worth.",
                  points: ["Auto-categorized transactions", "Multi-account, multi-currency", "No bank login required"],
                },
                {
                  n: "02",
                  icon: Waves,
                  color: BLUE,
                  title: "Understand where it really goes",
                  text: "An interactive cashflow Sankey shows income flowing into spending and savings. Spend analytics break down categories, merchants, and month-over-month trends, and the recurring radar surfaces every subscription quietly draining your account.",
                  points: ["Cashflow Sankey", "Spending intelligence", "Recurring charge detection"],
                },
                {
                  n: "03",
                  icon: LineChart,
                  color: PURPLE,
                  title: "Project your entire future",
                  text: "The Net Worth Atlas runs a month-by-month lifetime simulation: income, raises, contributions, debt payoff, inflation, and pensions. It finds your financial-independence age, stress-tests the plan across 400 markets, and reacts to every lever in real time.",
                  points: ["Wealth curve to age 100", "Financial-independence age", "Retirement & Monte Carlo"],
                },
              ].map((p) => (
                <article
                  key={p.n}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                  style={{ boxShadow: "0 8px 40px -20px rgba(0,0,0,0.7)" }}
                >
                  <div
                    className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `radial-gradient(ellipse 70% 80% at 30% 0%, ${p.color}1f, transparent 70%)` }}
                    aria-hidden="true"
                  />
                  <div className="relative z-10">
                    <div className="mb-4 flex items-center justify-between">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl ring-1"
                        style={{ backgroundColor: `${p.color}1A`, boxShadow: `0 0 22px ${p.color}26` }}
                      >
                        <p.icon className="h-5 w-5" style={{ color: p.color }} aria-hidden />
                      </div>
                      <span className="font-aldhabi text-3xl font-bold text-white/10">{p.n}</span>
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-white">{p.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/65">{p.text}</p>
                    <ul className="mt-4 space-y-1.5">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-center gap-2 text-[12.5px] text-white/75">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: p.color }} aria-hidden />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── Net Worth Atlas centerpiece ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#040810" }}
          aria-labelledby="atlas-heading"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 70% 20%, rgba(44,162,255,0.10), transparent), radial-gradient(ellipse 50% 40% at 15% 90%, rgba(11,193,141,0.08), transparent)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p
                className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] sm:text-sm"
                style={{
                  background: `linear-gradient(90deg, ${GREEN}, ${GOLD})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                The centerpiece
              </p>
              <h2 id="atlas-heading" className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                The Net Worth Atlas
              </h2>
              <p className="mt-4 text-white/70">
                This is the part no budgeting app gives you. A living, month-by-month
                model of your whole financial life. Set your income and savings, drag
                your retirement age, adjust returns and inflation, and the entire curve
                rewrites itself instantly, including the year you become financially free.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  { icon: LineChart, color: GREEN, t: "Lifetime wealth curve", d: "Assets compound individually, debts amortize with real APRs, contributions grow with your raises." },
                  { icon: Flag, color: BLUE, t: "Financial-independence age", d: "See the exact age your invested wealth covers your spending forever, at 25x the 4% rule." },
                  { icon: Activity, color: PURPLE, t: "400-path Monte Carlo", d: "Stress-test the plan across hundreds of randomized markets and read your real success probability." },
                  { icon: Layers, color: GOLD, t: "Live scenarios & levers", d: "Every slider feeds one engine, so milestones, timeline, and three side-by-side futures stay in sync." },
                ].map((f) => (
                  <div key={f.t} className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1"
                      style={{ backgroundColor: `${f.color}18`, boxShadow: `0 0 18px ${f.color}22` }}
                    >
                      <f.icon className="h-4 w-4" style={{ color: f.color }} aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{f.t}</h3>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">{f.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link href={SIGN_UP_URL}>
                  <Button
                    size="lg"
                    className="group h-12 border-0 px-7 text-base font-semibold text-emerald-950 shadow-[0_0_36px_rgba(11,193,141,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_56px_rgba(11,193,141,0.65)]"
                    style={{ background: `linear-gradient(90deg, ${GREEN}, ${BLUE})` }}
                  >
                    Map Your Future Free
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Wealth-curve showcase */}
            <div className="relative">
              <div
                className="rounded-3xl border border-white/10 p-4 backdrop-blur-sm sm:p-6"
                style={{
                  background: "linear-gradient(160deg, rgba(11,193,141,0.06), rgba(4,8,16,0.4))",
                  boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)",
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/45">Projected net worth</p>
                    <p className="text-2xl font-black tracking-tight text-white">$4.9M</p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: `${GREEN}1d`, color: GREEN }}
                  >
                    Free at 61
                  </span>
                </div>
                <svg viewBox="0 0 560 300" className="w-full" role="img" aria-label="Projected net worth growing to retirement">
                  <defs>
                    <linearGradient id="lpCurve" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={BLUE} />
                      <stop offset="55%" stopColor={GREEN} />
                      <stop offset="100%" stopColor={GOLD} />
                    </linearGradient>
                    <linearGradient id="lpFanOuter" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BLUE} stopOpacity="0.16" />
                      <stop offset="100%" stopColor={GREEN} stopOpacity="0.04" />
                    </linearGradient>
                    <linearGradient id="lpFanInner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN} stopOpacity="0.26" />
                      <stop offset="100%" stopColor={BLUE} stopOpacity="0.08" />
                    </linearGradient>
                    <filter id="lpGlow">
                      <feGaussianBlur stdDeviation="3.2" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* grid */}
                  {[60, 120, 180, 240].map((y) => (
                    <line key={y} x1="36" y1={y} x2="544" y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  ))}
                  {["$0", "$1.5M", "$3M", "$4.5M"].map((l, i) => (
                    <text key={l} x="30" y={246 - i * 60} fontSize="10" textAnchor="end" fill="rgba(255,255,255,0.4)">
                      {l}
                    </text>
                  ))}

                  {/* uncertainty fan */}
                  <path
                    d="M36 232 C 150 210, 250 165, 340 120 C 410 86, 480 60, 544 40 L 544 96 C 480 120, 410 148, 340 176 C 250 206, 150 226, 36 244 Z"
                    fill="url(#lpFanOuter)"
                  />
                  <path
                    d="M36 236 C 150 220, 250 184, 340 146 C 410 116, 480 92, 544 72 L 544 84 C 480 104, 410 130, 340 160 C 250 192, 150 220, 36 240 Z"
                    fill="url(#lpFanInner)"
                  />

                  {/* retirement marker at age 65 */}
                  <line x1="430" y1="20" x2="430" y2="270" stroke={CORAL} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 4" />
                  <g transform="translate(430, 26)">
                    <rect x="-30" y="-13" width="60" height="18" rx="9" fill={CORAL} fillOpacity="0.9" />
                    <text x="0" y="0" fontSize="10" fontWeight="700" textAnchor="middle" fill="#fff">retire 65</text>
                  </g>

                  {/* FI marker at age 61 */}
                  <line x1="372" y1="40" x2="372" y2="250" stroke={GREEN} strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="6 4" />
                  <g transform="translate(372, 250)">
                    <rect x="-34" y="-2" width="68" height="17" rx="8.5" fill={`${GREEN}29`} stroke={GREEN} strokeOpacity="0.5" strokeWidth="0.75" />
                    <text x="0" y="10.5" fontSize="9" fontWeight="700" textAnchor="middle" fill={GREEN}>FREEDOM 61</text>
                  </g>

                  {/* deterministic curve */}
                  <path
                    d="M36 234 C 150 215, 250 175, 340 133 C 410 100, 480 76, 544 56"
                    fill="none"
                    stroke="url(#lpCurve)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    filter="url(#lpGlow)"
                  />

                  {/* today dot */}
                  <circle cx="36" cy="234" r="4" fill={BLUE} stroke="#040810" strokeWidth="1.5" />
                  <circle cx="372" cy="118" r="4.5" fill={GREEN} stroke="#040810" strokeWidth="2" />

                  {/* age axis */}
                  {[
                    { x: 36, l: "40" },
                    { x: 200, l: "55" },
                    { x: 372, l: "70" },
                    { x: 544, l: "100" },
                  ].map((a) => (
                    <text key={a.l} x={a.x} y="288" fontSize="10" textAnchor="middle" fill="rgba(255,255,255,0.4)">
                      age {a.l}
                    </text>
                  ))}
                </svg>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-white/55">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full" style={{ background: `linear-gradient(90deg, ${BLUE}, ${GREEN}, ${GOLD})` }} />
                    Your plan
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm" style={{ background: `${GREEN}33` }} />
                    Likely range
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm" style={{ background: `${BLUE}1f` }} />
                    Possible range
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────── Feature grid ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#050a12" }}
          aria-labelledby="features-heading"
        >
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                Everything your household needs to run its money
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-white/65">
                Built for real life: multiple accounts, multiple currencies, messy
                statements, and a future worth planning for.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Upload,
                  color: GREEN,
                  title: "Drop any statement",
                  text: "PDF, CSV, Excel, or a phone screenshot from any bank, card, brokerage, or wallet. AI parses the layout, extracts every line, and de-duplicates against your history.",
                },
                {
                  icon: BrainCircuit,
                  color: BLUE,
                  title: "Categorization that learns you",
                  text: "Every transaction is auto-categorized into parent and subcategories. Correct one and FinTRK remembers, so your spending picture gets sharper with every upload.",
                },
                {
                  icon: Waves,
                  color: PURPLE,
                  title: "Cashflow Sankey",
                  text: "Watch income flow into spending and savings in one interactive diagram. Hover any ribbon to trace exactly where the money went, down to the merchant.",
                },
                {
                  icon: BarChart3,
                  color: GOLD,
                  title: "Spend analytics",
                  text: "Monthly stacked spending, category breakdowns, top merchants, and discretionary analysis. Slice any timeframe and every chart recomputes instantly.",
                },
                {
                  icon: Repeat,
                  color: GREEN,
                  title: "Recurring radar",
                  text: "FinTRK surfaces the subscriptions and recurring charges hiding in your statements, even ones that change name or amount, so nothing runs on autopilot unnoticed.",
                },
                {
                  icon: Wallet,
                  color: BLUE,
                  title: "Net worth, one number",
                  text: "Every account in its own currency rolls up to a single home-currency net worth and balance sheet, with assets and liabilities tracked over time.",
                },
                {
                  icon: Gauge,
                  color: PURPLE,
                  title: "Readiness score",
                  text: "A single 0-100 score blends savings rate, debt load, and plan success into one honest read on how on-track your household really is.",
                },
                {
                  icon: Target,
                  color: GOLD,
                  title: "Retirement & FI planning",
                  text: "Model pensions, Social Security, drawdown, and inflation. Find your financial-independence age and see how each lever moves it, in real time.",
                },
                {
                  icon: Bot,
                  color: GREEN,
                  title: "Ask your money anything",
                  text: "Connect ChatGPT, Claude, or any MCP-compatible AI to your private data and ask real questions about your cashflow, spending, and net worth in plain language.",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-white/[0.01] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 sm:p-6"
                >
                  <div
                    className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `radial-gradient(ellipse 70% 80% at 30% 0%, ${item.color}1c, transparent 70%)` }}
                    aria-hidden="true"
                  />
                  <div className="relative z-10">
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1"
                        style={{ backgroundColor: `${item.color}1A`, boxShadow: `0 0 20px ${item.color}22` }}
                      >
                        <item.icon className="h-5 w-5" style={{ color: item.color }} aria-hidden />
                      </div>
                      <h3 className="text-sm font-bold tracking-tight text-white sm:text-base">{item.title}</h3>
                    </div>
                    <p className="text-[13px] leading-relaxed text-white/65">{item.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── How it works ────────────────── */}
        <section
          className="relative px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#040810" }}
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2 id="how-heading" className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                Three steps. Zero spreadsheets.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-white/65">
                From a raw statement to a complete financial plan in under a minute.
              </p>
            </div>
            <div className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
              <div
                className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px md:block"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${GREEN}66 20%, ${BLUE}66 50%, ${PURPLE}66 80%, transparent 100%)`,
                }}
                aria-hidden="true"
              />
              {[
                {
                  step: "01",
                  title: "Upload",
                  text: "Drop a PDF, CSV, Excel, or screenshot from any bank, card, brokerage, or wallet. AI parses even messy layouts in seconds.",
                  icon: Upload,
                  color: GREEN,
                },
                {
                  step: "02",
                  title: "Organize",
                  text: "Every transaction is categorized, every recurring charge surfaced, every currency normalized. Cashflow, analytics, and net worth build automatically.",
                  icon: BrainCircuit,
                  color: BLUE,
                },
                {
                  step: "03",
                  title: "Plan",
                  text: "Open the Net Worth Atlas, set your levers, and see your wealth, retirement, and freedom age projected to 100, then adjust until you love the outcome.",
                  icon: Target,
                  color: PURPLE,
                },
              ].map((item) => (
                <div key={item.step} className="relative text-center">
                  <div
                    className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ring-2"
                    style={{ boxShadow: `0 0 32px ${item.color}40`, borderColor: `${item.color}50`, backgroundColor: "#040810" }}
                  >
                    <item.icon className="h-6 w-6" style={{ color: item.color }} aria-hidden />
                  </div>
                  <p
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
                    style={{
                      background: `linear-gradient(90deg, ${item.color}, ${GOLD})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Step {item.step}
                  </p>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── Privacy & trust ────────────────── */}
        <section
          className="border-y border-white/10 px-4 py-16 sm:px-6 sm:py-24"
          style={{ background: "#03070d" }}
          aria-labelledby="trust-heading"
        >
          <div className="mx-auto max-w-6xl text-center">
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ring-1"
              style={{ backgroundColor: `${GREEN}18`, borderColor: `${GREEN}4d` }}
            >
              <Lock className="h-6 w-6" style={{ color: GREEN }} aria-hidden />
            </div>
            <h2 id="trust-heading" className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Your money data deserves better than &ldquo;trust us&rdquo;.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/65">
              No screen-scraping. No bank logins shared with third parties. You upload
              statements you already have, and we process them privately.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-5 text-left sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  color: GREEN,
                  title: "Encrypted end to end",
                  text: "Encrypted in transit and at rest. Statements are processed privately and the raw files can be wiped any time from your settings.",
                },
                {
                  icon: Landmark,
                  color: BLUE,
                  title: "No bank linking",
                  text: "No Plaid, no Yodlee, no aggregator holding your online-banking credentials. You choose what to upload and what FinTRK ever sees.",
                },
                {
                  icon: Network,
                  color: PURPLE,
                  title: "Never sold. Never trained on.",
                  text: "Your transactions are not a product. They are never sold to data brokers, never used to train models. Delete your account and they are gone.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div
                    className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1"
                    style={{ backgroundColor: `${item.color}1a`, borderColor: `${item.color}4d` }}
                  >
                    <item.icon className="h-4 w-4" style={{ color: item.color }} aria-hidden />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────── Final CTA ────────────────── */}
        <section
          className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(11,193,141,0.12), transparent), radial-gradient(ellipse 60% 50% at 30% 60%, rgba(173,116,255,0.08), transparent), #030609",
          }}
          aria-labelledby="cta-heading"
        >
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl ring-1"
              style={{ backgroundColor: `${GOLD}16`, borderColor: `${GOLD}40` }}
            >
              <Coins className="h-8 w-8" style={{ color: GOLD }} aria-hidden />
            </div>
            <p
              className="mb-3 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm"
              style={{
                background: `linear-gradient(90deg, ${GREEN}, ${BLUE}, ${GOLD})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your statements already hold the answers
            </p>
            <h2 id="cta-heading" className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Stop guessing.
              <br />
              <span
                style={{
                  background: `linear-gradient(90deg, ${GREEN} 0%, ${BLUE} 50%, ${GOLD} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Start owning your future.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-white/70">
              Upload one statement and watch your whole financial life organize itself,
              then open the Net Worth Atlas and see exactly where today&rsquo;s habits
              take you in 10, 20, and 40 years. Your data stays yours, private by design.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={SIGN_UP_URL}>
                <Button
                  size="lg"
                  className="group h-12 w-full border-0 px-8 text-base font-semibold text-emerald-950 shadow-[0_0_44px_rgba(11,193,141,0.5)] transition-all hover:scale-[1.02] hover:shadow-[0_0_64px_rgba(11,193,141,0.75)] sm:w-auto"
                  style={{ background: `linear-gradient(90deg, ${GREEN}, ${BLUE})` }}
                >
                  Create Your Account
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Button>
              </Link>
              <Link href={SIGN_IN_URL}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full border-white/20 bg-white/[0.04] px-7 text-base font-medium text-white/90 hover:border-white/40 hover:bg-white/[0.08] hover:text-white sm:w-auto"
                >
                  I already have an account
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-widest text-white/40">
              Private by design · Encrypted from upload to delete
            </p>
          </div>
        </section>

        {/* ────────────────── Footer ────────────────── */}
        <footer className="border-t border-white/10 px-4 py-10 sm:px-6" style={{ background: "#020509" }}>
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-2">
              <span
                className="font-aldhabi text-lg font-bold tracking-tight"
                style={{
                  background: `linear-gradient(90deg, ${GREEN}, ${BLUE}, ${PURPLE})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                FinTRK
              </span>
              <span className="text-xs text-white/40">Track. Understand. Project.</span>
            </div>
            <p className="text-[11px] text-white/40">
              &copy; {new Date().getFullYear()} FinTRK. Budgeting, tracking &amp; financial planning for households.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
