"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Toaster } from "sonner";
import { AdminSidebar } from "@/components/admin-sidebar";

export function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname?.startsWith("/login") ?? false;
  const [collapsed, setCollapsed] = useState(false);

  if (isLogin) {
    return (
      <>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      <main
        className="min-h-screen transition-[padding] duration-200"
        style={{ paddingLeft: collapsed ? 20 : 270 }}
      >
        {children}
      </main>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
