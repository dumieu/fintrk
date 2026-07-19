"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppHref } from "@/lib/app-base-path";

export default function CategoriesPage() {
  const router = useRouter();
  const href = useAppHref("/profile?tab=categories");
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}
