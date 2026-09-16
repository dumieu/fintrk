import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ClerkDbUserSync } from "@/components/clerk-db-user-sync";
import { ClerkProviderWrapper } from "@/components/clerk-theme-wrapper";
import { DeviceProvider } from "@/components/device/device-context";
import { MobileDesktopNudge } from "@/components/mobile/mobile-desktop-nudge";
import { SiteFooter } from "@/components/site-footer";
import { TimeTracker } from "@/components/time-tracker";
import { detectPhoneFromHeaders } from "@/lib/device/detect";
import { MOBILE_NUDGE_FAILSAFE_SCRIPT } from "@/lib/device/mobile-nudge";

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

  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/fintrk-launcher.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/icons/fintrk-launcher.png",
    apple: [
      { url: "/icons/fintrk-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialIsPhone = detectPhoneFromHeaders(await headers());

  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      data-device={initialIsPhone ? "phone" : "desktop"}
      data-mobile-nudge={initialIsPhone ? "open" : undefined}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;var t=localStorage.getItem('theme');if((p.startsWith('/dashboard')||p.startsWith('/blog'))&&t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {initialIsPhone ? (
          <script
            id="fintrk-mobile-nudge-failsafe"
            dangerouslySetInnerHTML={{ __html: MOBILE_NUDGE_FAILSAFE_SCRIPT }}
          />
        ) : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Aldhabi&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${inter.className} flex h-dvh max-h-dvh min-h-0 min-w-0 flex-col overflow-hidden`}
      >
        <ClerkProviderWrapper>
          <DeviceProvider initialIsPhone={initialIsPhone}>
            <MobileDesktopNudge />
            <ClerkDbUserSync />
            <TimeTracker />
            <Providers>
              <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                {/* flex + min-h-0 so dashboard routes fill height; overflow-y-auto for long non-dashboard pages */}
                <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto">
                  {children}
                  <SiteFooter />
                </div>
              </div>
            </Providers>
          </DeviceProvider>
        </ClerkProviderWrapper>
      </body>
    </html>
  );
}
