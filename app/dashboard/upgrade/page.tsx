import { Sparkles } from "lucide-react";

import { ManageBillingButton } from "@/components/manage-billing-button";
import { UpgradeAccountActions } from "@/components/upgrade-account-actions";
import { UpgradePricing } from "@/components/upgrade-pricing";
import { getPlanState } from "@/lib/plan";

export const dynamic = "force-dynamic";

const ACCENT_HEX = "#0BC18D";

function statusLabel(status: string | null, renewsAt: number | null): string | null {
  if (!status) return null;
  const when = renewsAt ? new Date(renewsAt * 1000).toLocaleDateString() : null;
  if (status === "trialing") return when ? `Free trial - renews ${when}` : "Free trial active";
  if (status === "active") return when ? `Active - renews ${when}` : "Active";
  if (status === "past_due") return "Payment past due - please update your card";
  if (status === "canceled") return "Canceled";
  return status;
}

export default async function UpgradePage() {
  const { isPro, status, renewsAt, manageable } = await getPlanState();
  const label = statusLabel(status, renewsAt);

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
              {label ? (
                <p className="mt-3 text-sm font-medium" style={{ color: ACCENT_HEX }}>
                  {label}
                </p>
              ) : null}
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

        {isPro && manageable ? <ManageBillingButton /> : <UpgradePricing canTrial={!manageable} />}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Billing is handled securely by Stripe. Prices in USD.
        </p>

        <UpgradeAccountActions />
      </div>
    </div>
  );
}
