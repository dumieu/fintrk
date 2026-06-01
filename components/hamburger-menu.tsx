"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Menu,
  User,
  Upload,
  ArrowLeftRight,
  BarChart3,
  Landmark,
  Mail,
  HelpCircle,
  LogIn,
  LogOut,
  Settings,
  Network,
  Waves,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FintrkShortLogo } from "@/components/fintrk-short-logo";

const ACCENT_HEX = "#0BC18D";

export function HamburgerMenu() {
  const pathname = usePathname();
  const basePath = "/dashboard";
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  let clerk: { openUserProfile: () => void; signOut: (opts: { redirectUrl: string }) => void } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useClerk } = require("@clerk/nextjs");
    clerk = useClerk();
  } catch {
    clerk = null;
  }

  const handleManageAccount = useCallback(() => {
    setSheetOpen(false);
    setTimeout(() => { clerk?.openUserProfile(); }, 350);
  }, [clerk]);

  const handleSignOut = useCallback(() => {
    setSheetOpen(false);
    setTimeout(() => { clerk?.signOut({ redirectUrl: "/" }); }, 350);
  }, [clerk]);

  const navItems = [
    { label: "Upload Statement", href: `${basePath}/upload`, icon: Upload },
    { label: "Transactions", href: `${basePath}/transactions`, icon: ArrowLeftRight },
    { label: "Cashflow", href: `${basePath}/cashflow`, icon: Waves },
    { label: "Spend Analytics", href: `${basePath}/analytics`, icon: BarChart3 },
    { label: "Money X-Ray", href: `${basePath}/x-ray`, icon: ScanSearch },
    { label: "Net Worth Atlas", href: `${basePath}/net-worth`, icon: Sparkles },
    { label: "Accounts", href: `${basePath}/accounts`, icon: Landmark },
    { label: "Category Mapping", href: `${basePath}/categories`, icon: Network },
  ];

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
            <Menu className="w-5 h-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        }
      />
      <SheetContent side="left" showCloseButton={false} className="w-72 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FintrkShortLogo size="header" />
              <SheetTitle className="font-aldhabi text-lg font-bold tracking-tight" style={{ color: ACCENT_HEX }}>
                FinTRK
              </SheetTitle>
            </div>
            <ThemeToggle />
          </div>
          <SheetDescription className="sr-only">Navigation menu</SheetDescription>
        </SheetHeader>

        <nav className="flex-1 px-3 py-3">
          <ul className="space-y-1">
            <li>
              <SheetClose
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/profile`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith(`${basePath}/profile`)
                        ? "bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <User className="w-5 h-5 shrink-0" />
                    My Profile
                  </Link>
                }
              />
            </li>
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <SheetClose
                    nativeButton={false}
                    render={
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary/10"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        {item.label}
                      </Link>
                    }
                  />
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-border" />

          <ul className="space-y-1">
            <li>
              <SheetClose
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/connect-ai`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith(`${basePath}/connect-ai`)
                        ? "bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Sparkles className="w-5 h-5 shrink-0" style={{ color: ACCENT_HEX }} />
                    Connect your AI
                  </Link>
                }
              />
            </li>
            <li>
              <SheetClose
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/contact`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      pathname === `${basePath}/contact`
                        ? "bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Mail className="w-5 h-5 shrink-0" />
                    Contact
                  </Link>
                }
              />
            </li>
            <li>
              <SheetClose
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/faq`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      pathname === `${basePath}/faq`
                        ? "bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <HelpCircle className="w-5 h-5 shrink-0" />
                    FAQ
                  </Link>
                }
              />
            </li>
          </ul>
        </nav>

        <div className="mt-auto border-t border-border px-3 py-3">
          {hasClerkKeys && clerk ? (
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={handleManageAccount}
                  className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-muted/50 cursor-pointer"
                >
                  <Settings className="w-5 h-5 shrink-0" />
                  Manage Account
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  Sign Out
                </button>
              </li>
            </ul>
          ) : (
            <SheetClose
              nativeButton={false}
              render={
                <Link
                  href="/auth"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-primary transition-colors"
                >
                  <LogIn className="w-5 h-5 shrink-0" />
                  Sign up / Log in
                </Link>
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
