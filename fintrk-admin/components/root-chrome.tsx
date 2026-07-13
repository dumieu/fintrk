"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { AdminShell } from "@/components/admin-shell";

export function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname?.startsWith("/login") ?? false;

  if (isLogin) {
    return (
      <>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <>
      <AdminShell>{children}</AdminShell>
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
