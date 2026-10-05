import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at mandmimporters.com/catalog-admin via a rewrite on the public site.
  basePath: "/catalog-admin",
  poweredByHeader: false,
  serverExternalPackages: [
    "firebase-admin",
    "pg",
    "@google-cloud/cloud-sql-connector",
    "puppeteer-core",
    "@sparticuz/chromium",
    "qrcode",
    "@anthropic-ai/sdk",
  ],
  // Bundle the SQL migrations and sheet CSS into every serverless function so
  // runtime readers (lib/db.ts, lib/sheet/html.tsx) can find them.
  outputFileTracingIncludes: {
    "/**/*": ["./migrations/*.sql", "./lib/sheet/*.css"],
  },
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
