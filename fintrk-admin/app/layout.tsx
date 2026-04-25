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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider dynamic>
      <html lang="en">
        <body className="min-h-screen bg-background font-sans">
          <RootChrome>{children}</RootChrome>
        </body>
      </html>
    </ClerkProvider>
  );
}
