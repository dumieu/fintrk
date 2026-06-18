"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

/** Direct URL fallback: `/sign-out` always ends the Clerk session. */
export default function SignOutPage() {
  const { signOut, loaded } = useClerk();

  useEffect(() => {
    if (!loaded) return;
    void signOut({ redirectUrl: "/" });
  }, [loaded, signOut]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Signing you out&hellip;</p>
    </div>
  );
}
