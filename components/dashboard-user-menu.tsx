"use client";

import { UserButton } from "@clerk/nextjs";
import { EyeOff, Landmark, Network, Settings2 } from "lucide-react";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Compact Clerk avatar menu with FinTRK profile sections + Manage account / Sign out. */
export function DashboardUserMenu() {
  if (!hasClerkKeys) return null;

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    >
      <UserButton.MenuItems>
        <UserButton.Link
          label="Settings"
          labelIcon={<Settings2 className="size-4" aria-hidden />}
          href="/dashboard/profile"
        />
        <UserButton.Link
          label="Accounts"
          labelIcon={<Landmark className="size-4" aria-hidden />}
          href="/dashboard/profile?tab=accounts"
        />
        <UserButton.Link
          label="Category Mapping"
          labelIcon={<Network className="size-4" aria-hidden />}
          href="/dashboard/profile?tab=categories"
        />
        <UserButton.Link
          label="Ignored"
          labelIcon={<EyeOff className="size-4" aria-hidden />}
          href="/dashboard/profile?tab=ignored"
        />
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
