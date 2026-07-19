import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DemoAppShell } from "../demo-app-shell";
import {
  FintrkPriceInlineWas,
  FintrkPriceWithWas,
} from "@/components/fintrk-price-display";
import { fintrkPlanAnnualSavingsPercentRounded } from "@/lib/plan-pricing";

const ACCENT = "#0BC18D";
const BLUE = "#2CA2FF";

function DemoUpgradeContent() {
  const savings = fintrkPlanAnnualSavingsPercentRounded();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-12 text-center">
      <div
        className="mb-5 flex size-14 items-center justify-center rounded-2xl"
        style={{ background: `${ACCENT}1a`, color: ACCENT }}
      >
        <Sparkles className="size-7" />
      </div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0BC18D]">
        You are in the Sterling Family demo
      </p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Ready for your own FinTRK Pro?
      </h1>
      <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
        Billing is not available inside the shared demo. Start a 7-day free trial on
        your account to upload statements, connect AI, and keep your data private.
      </p>

      <div className="mt-8 w-full rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <FintrkPriceWithWas mode="annually" period="per month" size="lg" />
          <span className="text-sm text-muted-foreground">
            (billed <FintrkPriceInlineWas mode="annualTotal" suffix="/yr" />)
          </span>
        </div>
        <p className="mt-1 text-sm font-medium" style={{ color: ACCENT }}>
          FinTRK Pro · save {savings}% annually
        </p>
        <ul className="mt-5 space-y-2.5 text-sm text-foreground">
          {[
            "Unlimited statement uploads with AI extraction",
            "Cashflow, spend analytics & the Net Worth Atlas",
            "Connect ChatGPT, Claude & Perplexity to your data",
            "7-day free trial · cancel anytime",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0"
                style={{ color: ACCENT }}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Link href="/auth/sign-up" className="mt-6 block">
          <Button
            size="lg"
            className="group h-12 w-full border-0 text-base font-semibold text-emerald-950"
            style={{ background: `linear-gradient(90deg, ${ACCENT}, ${BLUE})` }}
          >
            Start 7-day free trial
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </Link>
      </div>

      <Link
        href="/demo/cashflow"
        className="mt-6 text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        Back to demo cashflow
      </Link>
    </div>
  );
}

export default function DemoUpgrade() {
  return (
    <DemoAppShell>
      <DemoUpgradeContent />
    </DemoAppShell>
  );
}
