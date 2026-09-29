# mandmimporters.com

Static site for M and M Importers, hosted on Vercel. No build step: pages are plain HTML.

- Wines live in wines/p/. The wine finder and pairing tool read assets/wines.json.
- Bottle photos are in images/images/, standardized to 600x900 on white. Pages reference them as /images/images/FILE?v=N; bump N when a photo changes so browsers fetch the new file.
- Contact and newsletter forms post to FormSubmit (office@mandmimporters.com) from assets/site.js.
- Redirects, cache rules and security headers are in vercel.json.
