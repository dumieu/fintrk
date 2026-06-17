import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ClerkDbUserSync } from "@/components/clerk-db-user-sync";
import { ClerkProviderWrapper } from "@/components/clerk-theme-wrapper";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const BASE_URL = "https://fintrk.io";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "FinTRK - Master your finances.",
    template: "%s | FinTRK",
  },
  description: "Track, analyze, and optimize your financial trajectory.",
  keywords: [
    "personal finance",
    "budget tracking",
    "investment portfolio",
    "financial planning",
    "expense tracking",
    "net worth",
    "financial goals",
    "wealth management",
  ],
  authors: [{ name: "FinTRK", url: BASE_URL }],
  creator: "FinTRK",
  publisher: "FinTRK",
  category: "Finance Technology",

  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "FinTRK",
    title: "FinTRK - Master your finances.",
    description: "Track, analyze, and optimize your financial trajectory.",
  },

  twitter: {
    card: "summary_large_image",
    title: "FinTRK - Master your finances.",
    description: "Track, analyze, and optimize your financial trajectory.",
  },

  robots: {
    index: true,
    follow: true,
  },

  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;var t=localStorage.getItem('theme');if((p.startsWith('/dashboard')||p.startsWith('/blog'))&&t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Aldhabi&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${inter.className} flex h-dvh max-h-dvh min-h-0 min-w-0 flex-col overflow-hidden`}
      >
        <ClerkProviderWrapper>
          <ClerkDbUserSync />
          <Providers>
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {/* flex + min-h-0 so dashboard routes can fill height; overflow-y-auto for long non-dashboard pages */}
              <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto">{children}</div>
              <SiteFooter />
            </div>
          </Providers>
        </ClerkProviderWrapper>
      </body>
    </html>
  );
}
