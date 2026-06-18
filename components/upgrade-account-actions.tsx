"use client";

import Link from "next/link";

import { SignOutControl } from "@/components/sign-out-control";

/** Visible on the paywall so users are never trapped behind checkout. */
export function UpgradeAccountActions() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 border-t border-border/40 pt-6">
      <SignOutControl variant="header" />
      <p className="text-center text-xs text-muted-foreground">
        Wrong account?{" "}
        <Link href="/sign-out" className="font-medium text-primary hover:underline">
          Sign out here
        </Link>
      </p>
    </div>
  );
}
