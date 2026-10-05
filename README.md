# mandmimporters.com

Static site for M and M Importers, hosted on Vercel. No build step: pages are plain HTML.

- Wines live in wines/p/. The wine finder and pairing tool read assets/wines.json.
- Bottle photos are in images/images/, standardized to 600x900 on white. Pages reference them as /images/images/FILE?v=N; bump N when a photo changes so browsers fetch the new file.
- Contact and newsletter forms post to FormSubmit (office@mandmimporters.com) from assets/site.js.
- Redirects, cache rules and security headers are in vercel.json.

## Catalog CMS (private)

- The office catalog system lives in `cms/` (Next.js). It is a separate Vercel project, `mandm-catalog`, with Root Directory `cms`.
- mandmimporters.com/catalog-admin is rewritten to that project (see `vercel.json`). The public site never serves `cms/` (see `.vercelignore`).
- Database migrations in `cms/migrations/` run automatically on every catalog build.
- Settings and secrets live in the mandm-catalog project's Environment Variables; see `cms/.env.example`.
