"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";

type SignOutControlProps = {
  /** Sidebar vs compact header label */
  variant?: "menu" | "header";
  className?: string;
  onClick?: () => void;
};

/**
 * Reliable sign-out control. Uses Clerk's SignOutButton so it works even when
 * `useAuth().userId` is still loading on the client.
 */
export function SignOutControl({
  variant = "menu",
  className,
  onClick,
}: SignOutControlProps) {
  const isHeader = variant === "header";

  return (
    <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          isHeader
            ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            : "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10",
          className,
        )}
      >
        <LogOut className={cn("shrink-0", isHeader ? "h-3.5 w-3.5" : "h-5 w-5")} />
        Sign Out
      </button>
    </SignOutButton>
  );
}
