"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoAppShell } from "../demo-app-shell";

const FAQ_ENTRIES: { q: string; a: string }[] = [
  {
    q: "What is this demo?",
    a: "You are inside the Sterling Family FinTRK account - five years of household finances (cashflow, spend, transactions, Net Worth Atlas). Edits look live but nothing is saved; refresh restores the shared dataset.",
  },
  {
    q: "What is FinTRK Pro?",
    a: "FinTRK Pro unlocks the full dashboard: statement upload, spend intelligence, cashflow, net worth, and AI assistant connections. New subscribers get a 7-day free trial, then continue at $6.98/month or $59.76/year ($4.98/month).",
  },
  {
    q: "Can I connect ChatGPT or Claude in the demo?",
    a: "You can browse Connect your AI and see how it works. Creating live OAuth or personal tokens needs your own FinTRK account - start a free trial to wire your assistants.",
  },
  {
    q: "How do I get my own account?",
    a: "Use Start free trial in the demo ribbon or menu. You will get a 7-day trial with full Pro access on your own data.",
  },
];

function DemoFaqContent() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Short answers for the Sterling demo and FinTRK billing. Still stuck?{" "}
          <Link
            href="/demo/contact"
            className="text-[#0BC18D] underline-offset-2 hover:underline"
          >
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
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {entry.a}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function DemoFaq() {
  return (
    <DemoAppShell>
      <DemoFaqContent />
    </DemoAppShell>
  );
}
