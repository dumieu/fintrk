import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          FinTRK
        </Link>
        {" / Privacy"}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 12, 2026</p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-foreground/90">
        <p>
          FinTRK is designed for personal financial tracking. You upload statements you already
          have; we do not ask for bank logins or screen-scraping credentials.
        </p>
        <p>
          Statement files and derived transaction data are processed to provide the product
          (categorization, analytics, net worth tools, and optional AI connections you enable).
          Data is encrypted in transit and at rest.
        </p>
        <p>
          We do not sell your transactions to data brokers, and we do not use your private
          financial data to train foundation models. You can delete uploaded statements and reset
          your FinTRK data from your profile settings.
        </p>
        <p>
          Account authentication is handled by Clerk. Billing is handled by Stripe. Those
          providers process the minimum identity and payment information needed to operate the
          service under their own policies.
        </p>
        <p>
          Questions about privacy or data deletion: use the{" "}
          <Link href="/contact" className="underline underline-offset-2 hover:text-foreground">
            contact form
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
