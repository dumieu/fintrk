"use client";

import Link from "next/link";
import { Play } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_LABEL = "See Demo Account";
/** Deep-link into the live app replica (not the marketing Sterling story). */
const DEFAULT_HREF = "/demo/cashflow";

const GREEN = "#0BC18D";
const BLUE = "#2CA2FF";

interface AnimatedDemoButtonProps {
  href?: string;
  external?: boolean;
  className?: string;
  /** Button label; defaults to landing-page copy. */
  label?: string;
  /**
   * Dark hero (e.g. /unauth1): glass outline matching the Start Free Trial CTA.
   * Default: gradient promo style for light / marketing contexts.
   */
  hero?: boolean;
}

export function AnimatedDemoButton({
  href = DEFAULT_HREF,
  external = false,
  className,
  label = DEFAULT_LABEL,
  hero = false,
}: AnimatedDemoButtonProps) {
  if (hero) {
    // Plain <a> (not next/link): client transitions stall on the scroll-snap hero.
    return (
      <a
        href={href}
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "group h-12 border-white/30 bg-transparent px-7 text-base font-semibold text-white hover:bg-white/10 hover:text-white",
          "dark:border-white/30 dark:bg-transparent dark:hover:bg-white/10 dark:hover:text-white",
          "relative z-40 w-full sm:w-auto",
          className,
        )}
      >
        <Play
          className="mr-2 h-4 w-4 shrink-0 fill-white text-white transition-transform group-hover:scale-110"
          aria-hidden
        />
        {label}
      </a>
    );
  }

  const linkProps = external
    ? { href, target: "_blank" as const, rel: "noopener noreferrer" }
    : { href };

  return (
    <Link {...linkProps} className={cn("group relative mt-1 inline-flex", className)}>
      <span
        className="absolute -inset-1 animate-demo-ping rounded-full opacity-0"
        style={{
          background: `linear-gradient(90deg, ${GREEN}, ${BLUE})`,
        }}
      />
      <span
        className="absolute -inset-0.5 animate-demo-glow rounded-full opacity-40 blur-md transition-all duration-500 group-hover:opacity-70 group-hover:blur-lg"
        style={{
          background: `linear-gradient(90deg, ${GREEN}, ${BLUE})`,
        }}
      />
      <span
        className="relative flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-emerald-950 shadow-lg transition-all duration-300 group-hover:scale-105 sm:px-5 sm:py-2.5 sm:text-base"
        style={{
          background: `linear-gradient(90deg, ${GREEN}, ${BLUE})`,
          boxShadow: `0 10px 28px ${GREEN}40`,
        }}
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-transform duration-300 group-hover:rotate-[360deg] group-hover:scale-110 sm:h-7 sm:w-7">
          <Play className="h-3.5 w-3.5 fill-emerald-950 text-emerald-950 sm:h-4 sm:w-4" />
        </span>
        <span className="relative overflow-hidden">
          <span className="relative z-10">{label}</span>
          <span className="absolute inset-0 z-20 animate-demo-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        </span>
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-demo-sparkle rounded-full bg-white" />
        <span className="absolute -bottom-0.5 -left-0.5 h-1 w-1 animate-demo-sparkle-delayed rounded-full bg-emerald-100" />
      </span>
    </Link>
  );
}
