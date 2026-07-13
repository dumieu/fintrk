"use client";

import { useState } from "react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { DecryptionSessionBanner } from "@/components/decryption-session-banner";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <main
        className="flex-1 min-w-0 w-full transition-all duration-200 overflow-x-clip"
        style={{ marginLeft: sidebarCollapsed ? 20 : 270 }}
      >
        <DecryptionSessionBanner />
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
