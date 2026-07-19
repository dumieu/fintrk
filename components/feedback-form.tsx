"use client";

import { useState, useTransition, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  ArrowRight,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Lightbulb,
  ChevronDown,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FintrkShortLogo } from "@/components/fintrk-short-logo";

const SENTIMENTS = [
  { value: "loving_it", label: "I'm loving it!", icon: ThumbsUp, color: "#0BC18D" },
  { value: "tough_time", label: "I'm having a tough time", icon: ThumbsDown, color: "#FF6F69" },
] as const;

type FieldErrors = {
  sentiment?: string[];
  message?: string[];
};

function normalizeSentimentFromUrl(raw: string | null): string {
  if (!raw) return "";
  const s = raw.trim().toLowerCase();
  if (s === "loving_it" || s === "tough_time") return s;
  return "";
}

function accountDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
} | null | undefined): string {
  if (!user) return "";
  const full = user.fullName?.trim();
  if (full) return full;
  const parts = [user.firstName, user.lastName].filter(Boolean) as string[];
  return parts.join(" ").trim();
}

const IDEA_QUESTIONS = [
  {
    key: "ideaRedesignScreen" as const,
    label:
      "If you could completely redesign one specific screen in the app, which one would it be and why?",
  },
  {
    key: "ideaOtherTools" as const,
    label:
      "What other tool, device, or app are you currently using alongside ours to get a complete picture of your finances?",
  },
  {
    key: "ideaSpreadsheetTracking" as const,
    label:
      "What is something you currently track in a spreadsheet or notes app because our app doesn't handle it the way you want?",
  },
  {
    key: "ideaFirstFeature" as const,
    label: "Which specific feature or chart do you check first thing when you open the app?",
  },
  {
    key: "ideaFriendDescription" as const,
    label: "How would you describe the main benefit of this app to a friend in one sentence?",
  },
  {
    key: "ideaMissMost" as const,
    label: "What would you miss the most if you could no longer use this app tomorrow?",
  },
];

type IdeaKey = (typeof IDEA_QUESTIONS)[number]["key"];

const fieldClass =
  "w-full rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:bg-background focus:ring-2 focus:ring-primary/25";
const readOnlyClass =
  "w-full cursor-default rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm outline-none";

interface FeedbackFormProps {
  embedded?: boolean;
  backHref?: string;
}

function FeedbackFormInner({ embedded, backHref = "/dashboard" }: FeedbackFormProps) {
  const searchParams = useSearchParams();
  const urlSentiment = normalizeSentimentFromUrl(searchParams.get("sentiment"));
  const { user, isLoaded } = useUser();

  const accountName = accountDisplayName(user);
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [sentimentEdited, setSentimentEdited] = useState(false);
  const [sentimentLocal, setSentimentLocal] = useState("");
  const [message, setMessage] = useState("");
  const [ideas, setIdeas] = useState<Record<IdeaKey, string>>({
    ideaRedesignScreen: "",
    ideaOtherTools: "",
    ideaSpreadsheetTracking: "",
    ideaFirstFeature: "",
    ideaFriendDescription: "",
    ideaMissMost: "",
  });
  const [ideasExpanded, setIdeasExpanded] = useState(false);
  const ideasContentRef = useRef<HTMLDivElement>(null);
  const [ideasHeight, setIdeasHeight] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (ideasContentRef.current) {
      setIdeasHeight(ideasContentRef.current.scrollHeight);
    }
  }, [ideasExpanded, ideas]);

  const filledIdeasCount = Object.values(ideas).filter((v) => v.trim().length > 0).length;
  const sentiment = sentimentEdited ? sentimentLocal : urlSentiment;
  const isSignedIn = !!user;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError("");

    if (!isSignedIn) {
      setServerError("Please sign in to submit feedback.");
      return;
    }

    const fieldErrors: FieldErrors = {};
    if (!sentiment) fieldErrors.sentiment = ["Please select how you're feeling"];
    if (!message.trim()) fieldErrors.message = ["Message is required"];

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentiment,
            message: message.trim(),
            ideaRedesignScreen: ideas.ideaRedesignScreen.trim(),
            ideaOtherTools: ideas.ideaOtherTools.trim(),
            ideaSpreadsheetTracking: ideas.ideaSpreadsheetTracking.trim(),
            ideaFirstFeature: ideas.ideaFirstFeature.trim(),
            ideaFriendDescription: ideas.ideaFriendDescription.trim(),
            ideaMissMost: ideas.ideaMissMost.trim(),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.errors) {
            setErrors(data.errors);
          } else {
            setServerError(data.error || "Something went wrong. Please try again.");
          }
          return;
        }

        setSubmitted(true);
      } catch {
        setServerError("Network error. Please check your connection and try again.");
      }
    });
  }

  if (submitted) {
    const sentimentData = SENTIMENTS.find((s) => s.value === sentiment);
    const isPositive = sentiment === "loving_it";

    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div
              className="absolute -inset-4 rounded-full blur-xl animate-pulse"
              style={{ backgroundColor: `${isPositive ? "#0BC18D" : "#2CA2FF"}20` }}
            />
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${isPositive ? "#0BC18D" : "#2CA2FF"}, ${isPositive ? "#0BC18D" : "#AD74FF"})`,
                boxShadow: `0 10px 25px ${isPositive ? "#0BC18D" : "#2CA2FF"}30`,
              }}
            >
              {isPositive ? (
                <Heart className="h-10 w-10 text-white" strokeWidth={1.5} />
              ) : (
                <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={1.5} />
              )}
            </div>
          </div>

          <h1 className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">
            {isPositive ? "Thank You!" : "We Hear You"}
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            {isPositive
              ? "We're thrilled you're enjoying FinTRK! Your feedback means the world to us."
              : "Thank you for sharing your experience. We're committed to making FinTRK better for you."}
          </p>

          {sentimentData && (
            <div
              className="mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: `${sentimentData.color}15`,
                color: sentimentData.color,
                border: `1px solid ${sentimentData.color}30`,
              }}
            >
              <sentimentData.icon className="h-4 w-4" />
              {sentimentData.label}
            </div>
          )}

          <Link
            href={backHref}
            className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {embedded ? "Back to Dashboard" : "Back to FinTRK"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto max-w-xl px-4 ${embedded ? "py-4 sm:py-6" : "py-8 sm:py-12"} sm:px-6`}
    >
      {!embedded && (
        <>
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to FinTRK
          </Link>

          <div className="mb-6 flex justify-center">
            <FintrkShortLogo size="header" className="!h-[72px] !w-[72px] !text-[32px] shadow-lg" />
          </div>
        </>
      )}

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          How are you enjoying FinTRK?
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Your feedback is invaluable to us. Let us know how we&apos;re doing and how we can
          improve your experience.
        </p>
      </div>

      {!isLoaded ? (
        <div className="mt-8 flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !isSignedIn ? (
        <div className="mt-8 rounded-2xl border border-border/50 bg-card/80 p-6 text-center shadow-xl backdrop-blur-sm sm:p-10">
          <p className="text-sm text-muted-foreground">
            Sign in to share feedback. Your name and email are taken from your account.
          </p>
          <Link
            href="/auth"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-6 text-sm font-medium text-background shadow-sm transition-all hover:bg-foreground/90"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8" autoComplete="off">
          <div className="rounded-2xl border border-border/50 bg-card/80 p-6 shadow-xl backdrop-blur-sm sm:p-10">
            <div className="space-y-6">
              <div className="space-y-2.5">
                <label
                  htmlFor="name"
                  className="flex items-center gap-2.5 text-[13px] font-medium tracking-wide text-foreground/80"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.04]">
                    <User className="h-3.5 w-3.5 text-foreground/40" strokeWidth={2} />
                  </div>
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={accountName}
                  readOnly
                  tabIndex={-1}
                  className={readOnlyClass}
                />
              </div>

              <div className="space-y-2.5">
                <label
                  htmlFor="email"
                  className="flex items-center gap-2.5 text-[13px] font-medium tracking-wide text-foreground/80"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.04]">
                    <Mail className="h-3.5 w-3.5 text-foreground/40" strokeWidth={2} />
                  </div>
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={accountEmail}
                  readOnly
                  tabIndex={-1}
                  className={readOnlyClass}
                />
              </div>

              <div className="space-y-2.5">
                <label
                  htmlFor="sentiment"
                  className="flex items-center gap-2.5 text-[13px] font-medium tracking-wide text-foreground/80"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.04]">
                    <Sparkles className="h-3.5 w-3.5 text-foreground/40" strokeWidth={2} />
                  </div>
                  How are you enjoying FinTRK so far?
                </label>
                <select
                  id="sentiment"
                  value={sentiment}
                  onChange={(e) => {
                    setSentimentEdited(true);
                    setSentimentLocal(e.target.value);
                    if (errors.sentiment) setErrors((p) => ({ ...p, sentiment: undefined }));
                  }}
                  className={`${fieldClass} h-12 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  }}
                  aria-invalid={!!errors.sentiment}
                >
                  <option value="">Select your experience</option>
                  {SENTIMENTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {errors.sentiment && (
                  <p className="pl-1 text-xs font-medium text-destructive">{errors.sentiment[0]}</p>
                )}
              </div>

              <div className="space-y-2.5">
                <label
                  htmlFor="message"
                  className="flex items-center gap-2.5 text-[13px] font-medium tracking-wide text-foreground/80"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.04]">
                    <MessageSquare className="h-3.5 w-3.5 text-foreground/40" strokeWidth={2} />
                  </div>
                  Message
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (errors.message) setErrors((p) => ({ ...p, message: undefined }));
                  }}
                  placeholder="Tell us more about your experience..."
                  rows={5}
                  required
                  className={`${fieldClass} min-h-[120px] resize-y`}
                  aria-invalid={!!errors.message}
                />
                <div className="flex items-center justify-between px-1">
                  {errors.message ? (
                    <p className="text-xs font-medium text-destructive">{errors.message[0]}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-[11px] tabular-nums text-muted-foreground/40">
                    {message.length.toLocaleString()} / 5,000
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => setIdeasExpanded((p) => !p)}
                className="group/ideas relative w-full overflow-hidden rounded-xl border border-[#AD74FF]/30 bg-gradient-to-r from-[#AD74FF]/[0.06] via-[#2CA2FF]/[0.04] to-[#0BC18D]/[0.06] p-4 text-left transition-all duration-300 hover:border-[#AD74FF]/50 hover:shadow-md hover:shadow-[#AD74FF]/5 dark:from-[#AD74FF]/[0.08] dark:via-[#2CA2FF]/[0.06] dark:to-[#0BC18D]/[0.08]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#AD74FF]/10 via-transparent to-[#0BC18D]/10 opacity-0 transition-opacity duration-500 group-hover/ideas:opacity-100" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#AD74FF]/20 to-[#2CA2FF]/20 transition-transform duration-300 group-hover/ideas:scale-105">
                      <Lightbulb
                        className="h-4.5 w-4.5 text-[#AD74FF] dark:text-[#c9a0ff]"
                        strokeWidth={1.8}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight text-foreground/90">
                          Ideas & Top Improvements
                        </span>
                        <Sparkles
                          className="h-3.5 w-3.5 text-[#ECAA0B] dark:text-[#fcd34d]"
                          strokeWidth={2}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                        {filledIdeasCount > 0
                          ? `${filledIdeasCount} of ${IDEA_QUESTIONS.length} answered - tap to ${ideasExpanded ? "collapse" : "expand"}`
                          : "Optional - help us build what matters to you"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {filledIdeasCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#AD74FF]/15 px-1.5 text-[10px] font-bold tabular-nums text-[#AD74FF] dark:text-[#c9a0ff]">
                        {filledIdeasCount}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-300 ${ideasExpanded ? "rotate-180" : ""}`}
                      strokeWidth={2}
                    />
                  </div>
                </div>
              </button>

              <div
                className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ maxHeight: ideasExpanded ? `${ideasHeight + 32}px` : "0px" }}
              >
                <div ref={ideasContentRef} className="space-y-5 pt-5">
                  {IDEA_QUESTIONS.map((q, i) => (
                    <div key={q.key} className="space-y-2">
                      <label
                        htmlFor={q.key}
                        className="flex items-start gap-2.5 text-[12px] font-medium leading-relaxed tracking-wide text-foreground/70"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#AD74FF]/10 text-[10px] font-bold tabular-nums text-[#AD74FF] dark:text-[#c9a0ff]">
                          {i + 1}
                        </span>
                        <span>{q.label}</span>
                      </label>
                      <textarea
                        id={q.key}
                        value={ideas[q.key]}
                        onChange={(e) =>
                          setIdeas((prev) => ({ ...prev, [q.key]: e.target.value }))
                        }
                        placeholder="Share your thoughts..."
                        rows={2}
                        className={`${fieldClass} min-h-[72px] resize-y border-[#AD74FF]/20 focus:ring-[#AD74FF]/20`}
                      />
                    </div>
                  ))}
                  <p className="pb-1 text-center text-[10px] text-muted-foreground/40">
                    All fields are optional - answer as many or as few as you like
                  </p>
                </div>
              </div>
            </div>

            {serverError && (
              <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-3.5">
                <p className="text-sm text-destructive">{serverError}</p>
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <Button
                type="submit"
                disabled={isPending}
                className="group h-11 rounded-lg bg-foreground px-6 text-sm font-medium text-background shadow-sm transition-all duration-200 hover:bg-foreground/90 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Submit Feedback
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export function FeedbackForm(props: FeedbackFormProps) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <FeedbackFormInner {...props} />
    </Suspense>
  );
}
