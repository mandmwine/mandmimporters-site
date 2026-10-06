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
  // Bundle the SQL migrations, sheet CSS, and self-hosted font files into every
  // serverless function so runtime readers (lib/db.ts, lib/sheet/html.tsx,
  // lib/sheet/fonts.ts) can find them.
  outputFileTracingIncludes: {
    "/**/*": [
      "./migrations/*.sql",
      "./lib/sheet/*.css",
      "./node_modules/@fontsource/inter/files/latin-{400,500,600}-normal.woff2",
      "./node_modules/@fontsource/cormorant-garamond/files/latin-{500,600}-normal.woff2",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          // SAMEORIGIN (not DENY) so the live-preview iframe on the wine edit page
          // can embed its own /sheet/[id] route. External sites still cannot frame
          // the admin.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
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
