import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  compress: true,
  // Pin tracing to this nested package so Next.js doesn't pick up the parent FinTRK app's lockfile.
  outputFileTracingRoot: path.join(__dirname),
  ...(isDev && {
    allowedDevOrigins: ["local.admin.fintrk.io:3005", "local.admin.fintrk.io"],
  }),

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
