import { PricingTable } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";

import { UpgradeAccountActions } from "@/components/upgrade-account-actions";
import { hasProAccess } from "@/lib/plan";

export const dynamic = "force-dynamic";

const ACCENT_HEX = "#0BC18D";

export default async function UpgradePage() {
  const isPro = await hasProAccess();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-app-canvas">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl"
            style={{ background: `${ACCENT_HEX}1a`, color: ACCENT_HEX }}
          >
            <Sparkles className="size-6" />
          </div>
          {isPro ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                You&rsquo;re on FinTRK Pro
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Manage your plan, switch billing periods, or update payment details below.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Unlock the full FinTRK
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Start your <span style={{ color: ACCENT_HEX }}>7-day free trial</span> to use
                uploads, cashflow, spend analytics, the Net Worth Atlas, and Connect-your-AI. No
                charge until your trial ends, and you can cancel anytime.
              </p>
            </>
          )}
        </div>

        <PricingTable for="user" />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Billing is handled securely by Stripe through Clerk. Prices in USD.
        </p>

        <UpgradeAccountActions />
      </div>
    </div>
  );
}
