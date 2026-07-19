import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { RootChrome } from "@/components/root-chrome";

export const metadata: Metadata = {
  title: "FinTRK Admin",
  description: "Administration console for FinTRK",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const CLERK_KEYS_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim(),
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans">
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  );

  // Match middleware soft-skip: only mount Clerk when publishable key is set.
  if (!CLERK_KEYS_PRESENT) return body;

  return <ClerkProvider dynamic>{body}</ClerkProvider>;
}
