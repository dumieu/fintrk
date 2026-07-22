import type { NextConfig } from "next";

/**
 * Permanent redirects for the legacy FinTRK Admin host/project.
 * Canonical app: xTRK Admin → Admin → FinTRK (`MktgTRK/app/admin/fintrk`).
 */
const DEST = "https://admin.xtrk.ai";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/api/:path*",
        destination: `${DEST}/api/admin/fintrk/:path*`,
        permanent: true,
      },
      {
        source: "/",
        destination: `${DEST}/admin/fintrk/overview`,
        permanent: true,
      },
      {
        source: "/:path*",
        destination: `${DEST}/admin/fintrk/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
