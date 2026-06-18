"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useClerk } from "@clerk/nextjs";
import { Settings } from "lucide-react";

import { SignOutControl } from "@/components/sign-out-control";

interface HamburgerAccountFooterProps {
  onClose: () => void;
  /** Set when the server already verified a signed-in session (dashboard routes). */
  sessionActive?: boolean;
}

/** Sidebar account actions — must render under ClerkProvider. */
export function HamburgerAccountFooter({
  onClose,
  sessionActive = false,
}: HamburgerAccountFooterProps) {
  const { openUserProfile } = useClerk();

  const handleManageAccount = useCallback(() => {
    onClose();
    window.setTimeout(() => openUserProfile(), 350);
  }, [onClose, openUserProfile]);

  if (!sessionActive) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        <Link href="/auth" className="font-medium text-primary hover:underline">
          Sign up / Log in
        </Link>
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      <li>
        <button
          type="button"
          onClick={handleManageAccount}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Settings className="h-5 w-5 shrink-0" />
          Manage Account
        </button>
      </li>
      <li>
        <SignOutControl variant="menu" onClick={onClose} />
      </li>
    </ul>
  );
}
