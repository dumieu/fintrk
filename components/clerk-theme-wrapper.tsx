"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const hasClerkKeys =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const DARK_APPEARANCE = { baseTheme: dark } as const;
const LIGHT_APPEARANCE = {} as const;

function useClerkAppearance() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const isLightDefault = pathname.startsWith("/auth");

    if (isLightDefault && savedTheme === null) {
      setTheme("light");
    } else {
      setTheme(savedTheme === "light" ? "light" : "dark");
    }

    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem("theme");
      setTheme(currentTheme === "light" ? "light" : "dark");
    };

    window.addEventListener("storage", handleThemeChange);
    window.addEventListener("themeChange", handleThemeChange);

    return () => {
      window.removeEventListener("storage", handleThemeChange);
      window.removeEventListener("themeChange", handleThemeChange);
    };
  }, [pathname]);

  return useMemo(
    () => (theme === "dark" ? DARK_APPEARANCE : LIGHT_APPEARANCE),
    [theme]
  );
}

export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  const appearance = useClerkAppearance();

  if (!hasClerkKeys) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}
