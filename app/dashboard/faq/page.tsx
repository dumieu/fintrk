"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FAQ_ENTRIES: { q: string; a: string }[] = [
  {
    q: "What is FinTRK Pro?",
    a: "FinTRK Pro unlocks the full dashboard: statement upload, spend intelligence, cashflow, net worth, and AI assistant connections. New subscribers get a 7-day free trial, then continue at $6.98/month or $59.76/year ($4.98/month; temporarily marked down from $9.98/month or $7.98/month billed annually). Cancel anytime before the trial ends and you won't be charged.",
  },
  {
    q: "How do I cancel or change my plan?",
    a: "Open Plan & Billing (Upgrade) and use Manage billing to open the Stripe customer portal. You can cancel, update payment method, or switch monthly/annual there.",
  },
  {
    q: "How do I connect Claude, ChatGPT, or another AI?",
    a: "Go to Connect your AI while on Pro. You can authorize via OAuth from your AI tool or create a personal access token. Access is read-only and can be revoked anytime.",
  },
  {
    q: "How do I reset or export my data?",
    a: "Profile includes export and a full data reset. Account deletion in Clerk also wipes FinTRK data via webhook. Contact support if you need help with a purge.",
  },
  {
    q: "Need more help?",
    a: "Use Feedback in the menu to reach us. Your name and email come from your FinTRK account automatically.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Short answers for billing, data, and AI connections. Still stuck?{" "}
          <Link href="/dashboard/contact" className="text-[#0BC18D] underline-offset-2 hover:underline">
            Send feedback
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3">
        {FAQ_ENTRIES.map((entry) => (
          <Card key={entry.q}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{entry.q}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              {entry.a}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
