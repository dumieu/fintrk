"use client";

import { UserButton } from "@clerk/nextjs";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Compact Clerk avatar menu (Manage account + Sign out) in the dashboard header. */
export function DashboardUserMenu() {
  if (!hasClerkKeys) return null;

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    />
  );
}
