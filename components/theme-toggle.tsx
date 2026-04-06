"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center rounded-full border border-border bg-muted/50 p-2 text-muted-foreground transition-colors hover:bg-muted min-h-[36px] min-w-[36px]"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4 text-blue-400" />
      )}
    </button>
  );
}
