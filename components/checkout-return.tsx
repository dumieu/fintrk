"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * After Stripe redirects back, write the subscription onto Clerk and refresh
 * the session token before entering the app.
 */
export function CheckoutReturn({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const userRef = useRef(user);
  const getTokenRef = useRef(getToken);
  userRef.current = user;
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Could not confirm checkout.",
          );
        }
        await userRef.current?.reload();
        await getTokenRef.current({ skipCache: true });
        if (!cancelled) router.replace("/dashboard/cashflow?subscribed=1");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not confirm checkout.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, router, sessionId]);

  if (error) {
    return (
      <p className="mb-6 text-center text-sm text-red-400" role="alert">
        {error}
      </p>
    );
  }

  return (
    <p className="mb-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Confirming your plan...
    </p>
  );
}
