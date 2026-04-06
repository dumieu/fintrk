"use client";

import { useEffect, useState, createContext, useContext, useRef, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within Providers");
  }
  return context;
}

function isPersistedThemeRoute(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/blog");
}

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>("dark");
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!isPersistedThemeRoute(pathname)) {
      setThemeState("dark");
      document.documentElement.classList.add("dark");
      return;
    }
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    if (savedTheme === "light") {
      setThemeState("light");
      document.documentElement.classList.remove("dark");
    } else {
      setThemeState("dark");
      document.documentElement.classList.add("dark");
    }
  }, [pathname]);

  const setTheme = useMemo(() => (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    if (!isPersistedThemeRoute(pathnameRef.current)) return;
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.dispatchEvent(new Event("themeChange"));
  }, []);

  const ctx = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={ctx}>
      {children}
    </ThemeContext.Provider>
  );
}
