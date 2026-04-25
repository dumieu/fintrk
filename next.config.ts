import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  poweredByHeader: false,
  compress: true,
  // Pin tracing to this app so the nested fintrk-admin lockfile doesn't confuse Next.js.
  outputFileTracingRoot: path.join(__dirname),
  ...(isDev && {
    allowedDevOrigins: ["local.fintrk.io:3004", "local.fintrk.io"],
  }),

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.fintrk.io https://*.clerk.services https://clerk-telemetry.com https://*.clerk-telemetry.com https://challenges.cloudflare.com https://accounts.google.com${isDev ? " http://localhost:*" : ""}`,
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self' https://*.clerk.accounts.dev https://clerk.fintrk.io https://api.clerk.com https://*.clerk.services https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.neon.tech wss://*.neon.tech https://accounts.google.com${isDev ? " http://localhost:*" : ""}`,
              `frame-src 'self' blob: https://*.clerk.accounts.dev https://clerk.fintrk.io https://challenges.cloudflare.com https://accounts.google.com${isDev ? " http://localhost:*" : ""}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(isDev ? [] : ["upgrade-insecure-requests"]),
            ].join("; "),
          },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            // Production: 1y immutable. Dev: never cache (HMR + chunk replacement).
            value: isDev ? "no-store, no-cache, must-revalidate" : "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
