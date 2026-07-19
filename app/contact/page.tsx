import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * Public contact entry: signed-in users go to the in-app feedback form.
 * Guests are pointed to sign in (authenticated feedback only).
 */
export default async function ContactPage() {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (userId) {
    redirect("/dashboard/contact");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          FinTRK
        </Link>
        {" / Contact"}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Contact &amp; Feedback</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to send feedback. Your name and email are taken from your FinTRK account.
      </p>
      <Link
        href="/auth"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-6 text-sm font-medium text-background shadow-sm transition-all hover:bg-foreground/90"
      >
        Sign in to continue
      </Link>
      <p className="mt-4 text-xs text-muted-foreground">
        Already signed in?{" "}
        <Link href="/dashboard/contact" className="underline underline-offset-2 hover:text-foreground">
          Open feedback
        </Link>
      </p>
    </main>
  );
}
