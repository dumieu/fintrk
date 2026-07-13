import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          FinTRK
        </Link>
        {" / Terms"}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 12, 2026</p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-foreground/90">
        <p>
          By using FinTRK you agree to use the service for lawful personal finance tracking and
          education. You are responsible for the statements and data you upload and for keeping
          your account credentials secure.
        </p>
        <p>
          FinTRK does not constitute financial advice. Insights, categorizations, projections, and
          AI-assisted summaries are informational tools and do not substitute for professional
          financial planning or investment counsel.
        </p>
        <p>
          Paid plans are billed through Stripe. Subscription changes, renewals, and cancellations
          are managed in the Stripe customer portal linked from your FinTRK upgrade page.
        </p>
        <p>
          We may update these terms as the product evolves. Continued use after an update means
          you accept the revised terms. If you do not agree, stop using the service and delete your
          data from your profile.
        </p>
        <p>
          Questions:{" "}
          <Link href="/contact" className="underline underline-offset-2 hover:text-foreground">
            contact us
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
