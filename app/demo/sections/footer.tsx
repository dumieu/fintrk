"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function DemoFooter() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0BC18D]/15 via-[#2CA2FF]/10 to-[#AD74FF]/15 p-8 sm:p-12 text-center">
      <div
        aria-hidden
        className="absolute -top-20 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-full bg-[#0BC18D]/15 blur-3xl"
      />
      <div className="relative">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0BC18D] to-[#2CA2FF] shadow-2xl shadow-[#0BC18D]/30">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h2 className="mt-5 text-2xl font-black text-white sm:text-3xl">
          This could be{" "}
          <span className="bg-gradient-to-r from-[#0BC18D] via-[#2CA2FF] to-[#AD74FF] bg-clip-text text-transparent">
            your money
          </span>
          .
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/75">
          Upload one statement and FinTRK will categorize, dedupe, and explain every transaction the same way.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#08051a] shadow-2xl shadow-[#0BC18D]/30 transition hover:scale-105"
          >
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="text-xs font-medium text-white/65 underline-offset-4 hover:text-white hover:underline"
          >
            Back to fintrk.io
          </Link>
        </div>
      </div>
    </section>
  );
}
