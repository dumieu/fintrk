"use client";

import { useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, country, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Could not send message.",
        );
      }
      setStatus("ok");
      setFullName("");
      setEmail("");
      setCountry("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send message.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          FinTRK
        </Link>
        {" / Contact"}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Contact Us</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Questions about FinTRK, billing, or your data? Send a message and we will get back to you.
      </p>

      {status === "ok" ? (
        <p className="mt-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          Thanks - your message was sent.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-xs font-medium text-muted-foreground">
              Full name
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="country" className="text-xs font-medium text-muted-foreground">
              Country (optional)
            </label>
            <input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="message" className="text-xs font-medium text-muted-foreground">
              Message
            </label>
            <textarea
              id="message"
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </main>
  );
}
