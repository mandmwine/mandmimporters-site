import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at mandmimporters.com/catalog-admin via a rewrite on the public site.
  basePath: "/catalog-admin",
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "pg", "@google-cloud/cloud-sql-connector"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // Private data must never be cached by the CDN or the browser.
        source: "/((?!_next/static|_next/image).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
