"use client";

import { usePathname } from "next/navigation";

/**
 * Resolves /dashboard vs /demo for shared page components reused in the
 * public demo. Pass a path like "/cashflow" or "/profile?tab=accounts".
 */
export function useAppBasePath(): "/dashboard" | "/demo" {
  const pathname = usePathname() ?? "";
  return pathname.startsWith("/demo") ? "/demo" : "/dashboard";
}

/** Join base (/dashboard|/demo) with a relative app path ("/upload"). */
export function appHref(base: "/dashboard" | "/demo", path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  // Tolerate callers who already passed an absolute dashboard/demo path.
  if (normalized.startsWith("/dashboard/")) {
    return `${base}${normalized.slice("/dashboard".length)}`;
  }
  if (normalized.startsWith("/demo/")) {
    return `${base}${normalized.slice("/demo".length)}`;
  }
  return `${base}${normalized}`;
}

export function useAppHref(path: string): string {
  return appHref(useAppBasePath(), path);
}
