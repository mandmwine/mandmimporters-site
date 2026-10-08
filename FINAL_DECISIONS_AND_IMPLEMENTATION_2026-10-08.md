# M&M Importers Catalog CMS — Final Decisions, Implementation Directives, and Code

**Date:** 2026-10-08  
**Purpose:** Resolve every question in `OPEN_QUESTIONS_2026-10-08.md` and convert the remaining work into concrete product and engineering instructions.

---

# 0. Governing product direction

This document should be treated as the implementation directive for the remaining M&M Imports catalog CMS work.

The CMS is a **private internal publishing system**. It is not a generic database admin, not a public customer portal, and not a replacement for the public website yet.

The priorities remain:

1. Make the workflow simple enough that a nontechnical office user can operate it without instruction.
2. Keep the single-wine sheet clean, restrained, readable, and reusable across the entire portfolio.
3. Make catalog creation, wine selection, preview, and export the center of the product.
4. Use AI as contextual assistance only. AI may propose; humans approve.
5. Preserve source provenance, verification history, and conflicts.
6. Use refined appellation-first maps, especially for France and Italy.
7. Preserve immutable catalog/export versions.
8. Keep Vercel as the application host.
9. Keep the CMS private for now.
10. Keep the data model presentation-neutral so the same records can later power public wine pages, distributor exports, QR pages, and customer views.

## Final answers at a glance

| # | Question | Decision |
|---|---|---|
| 1 | Producer editing UX | **Build the full producer workspace now** |
| 2 | Source conflict resolution | **Build side-by-side resolver with Pick / Edit / Reject; preserve losing provenance** |
| 3 | Light/default theme | **Phase 19 is not enough; make light mode the default and simplify further** |
| 4 | France / Italy maps | **Seed every appellation actually used; OSM may create drafts, but never auto-approve** |
| 5 | Dropbox | **Treat as not verified until a runtime health check proves content access works** |
| 6 | AI retention | **Nightly 60-day cleanup cron** |
| 7 | AI approval | **Keep per-record approval and add a global AI inbox** |
| 8 | Env vars/status page | **Build it** |
| 9 | UX test persistence | **Persist server-side** |
| 10 | UX acceptance | **Strict 6-of-6 for the six core workflows** |
| 11 | Customer account type | **P2 / defer** |
| 12 | Public website from CMS | **Architect for it, do not connect yet** |
| 13 | QR wine pages | **Defer until core publishing is stable** |
| 14 | Distributor-specific exports | **P2 after core exports are stable** |
| 15 | PDF/X | **Roadmap only until a commercial printer requires it** |
| 16 | Share expiration | **30 days by default** |
| 17 | Watermarks | **No PDF watermark; use web-only draft banner** |
| 18 | Backups | **Add independent nightly backup plus restore verification** |
| 19 | Error reporting | **Add Sentry + internal health page; no email digest required** |

---

# 1. Producer editing UX

## Decision

**Build a proper producer workspace now.**

The problem is not one isolated producer field. The producer is a first-class publishing entity because multiple wines inherit its identity, story, logo, location, and approved imagery.

Use:

```text
/catalog-admin/producers/[producerId]
```

## UX target

```text
← Producers

Vallepicciola
Italy · Tuscany

Almost ready

[ Preview ] [ Done ]
```

Sections:

```text
● Overview
● Story
● Logo & images
● Wines
! Review
```

Do not expose raw database terminology such as `winery_summary_short`, `wine_asset`, `location_id`, or provenance IDs in the primary UI.

## Producer fields

```ts
type ProducerRecord = {
  id: string;
  name: string;
  canonicalName: string;
  countryId: string | null;
  regionId: string | null;
  websiteUrl: string | null;
  shortSummary: string | null;
  longStory: string | null;
  logoAssetId: string | null;
  heroAssetId: string | null;
  defaultSupervisionIds: string[];
  status: "draft" | "needs_review" | "approved";
  lastVerifiedAt: string | null;
};
```

## Migration

```sql
alter table producers
  add column if not exists logo_asset_id uuid references assets(id),
  add column if not exists hero_asset_id uuid references assets(id),
  add column if not exists long_story text,
  add column if not exists website_url text,
  add column if not exists status text not null default 'draft',
  add column if not exists last_verified_at timestamptz;

create index if not exists producers_status_idx on producers(status);
```

Reuse existing equivalent columns if they already exist.

## Producer list requirements

Add:

- search,
- country filter,
- region filter,
- needs-review filter,
- missing-logo filter,
- missing-story filter.

Example query:

```ts
export async function listProducers(filters: {
  query?: string;
  countryId?: string;
  regionId?: string;
  needsReview?: boolean;
  missingLogo?: boolean;
}) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.query) {
    params.push(`%${filters.query}%`);
    where.push(`p.name ilike $${params.length}`);
  }

  if (filters.countryId) {
    params.push(filters.countryId);
    where.push(`p.country_id = $${params.length}`);
  }

  if (filters.missingLogo) {
    where.push(`p.logo_asset_id is null`);
  }

  if (filters.needsReview) {
    where.push(`p.status = 'needs_review'`);
  }

  return db.query(
    `
      select p.*, count(w.id) as wine_count
      from producers p
      left join wines w on w.producer_id = p.id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      group by p.id
      order by p.name asc
    `,
    params
  );
}
```

## AI producer bio

The user-facing controls should be:

```text
Winery story

[ current text ]

Improve   Shorten   Draft from sources
```

Not:

```text
Claude Assistant
Generate producer summary
```

The proposal flow is:

```text
Current
vs.
Suggested

[ Use this ] [ Try again ] [ Cancel ]
```

Nothing writes to the producer until **Use this** is clicked.

---

# 2. Source conflict resolution

## Decision

**Build the explicit resolver.**

Conflicts must not be resolved by silent overwrite.

## UX

```text
Sources

2 conflicts need review
```

Example:

```text
Aging

Producer technical sheet
18 months French oak
Verified 2026-10-07

Previous catalog
12 months French oak
Imported 2026-04-01

[ Use 18 months ] [ Use 12 months ] [ Enter another value ]
```

## Provenance status values

Recommended:

```text
pending
verified
conflict
accepted
rejected
superseded
```

Do not delete losing evidence.

## Resolution code

```ts
type ConflictResolutionInput = {
  entityType: "wine_vintage" | "producer";
  entityId: string;
  fieldName: string;
  winningProvenanceId?: string;
  manualValue?: unknown;
  note?: string;
};

export async function resolveFieldConflict(
  input: ConflictResolutionInput,
  userId: string
) {
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `
      select *
      from field_provenance
      where entity_type = $1
        and entity_id = $2
        and field_name = $3
      for update
      `,
      [input.entityType, input.entityId, input.fieldName]
    );

    if (!rows.length) throw new Error("No provenance rows found");

    let value: unknown;

    if (input.winningProvenanceId) {
      const winner = rows.find(
        (r) => r.id === input.winningProvenanceId
      );
      if (!winner) throw new Error("Winning provenance row not found");
      value = winner.normalized_value ?? winner.raw_value;
    } else {
      value = input.manualValue;
    }

    await writeResolvedField(
      tx,
      input.entityType,
      input.entityId,
      input.fieldName,
      value
    );

    await tx.query(
      `
      update field_provenance
      set verification_status =
        case when id = $1 then 'accepted' else 'rejected' end,
        verified_by = $2,
        verified_at = now()
      where entity_type = $3
        and entity_id = $4
        and field_name = $5
      `,
      [
        input.winningProvenanceId ?? null,
        userId,
        input.entityType,
        input.entityId,
        input.fieldName,
      ]
    );
  });
}
```

## Score conflicts

A critic score should retain:

```ts
type CriticScore = {
  criticId: string;
  vintageId: string;
  scoreText: string; // "95", "94-96", etc.
  reviewStage?: "barrel" | "bottle" | "retrospective";
  sourceId: string;
  reviewDate?: string;
  isPrimary: boolean;
};
```

If two scores exist from the same critic/vintage, show both sources. Do not automatically keep the higher number.

---

# 3. Light/default visual theme

## Decision

**Phase 19 is not final. Simplify further and make light mode the default.**

The CMS should feel like a publishing tool, not a developer console.

Reference character:

- Apple Settings,
- Notion,
- Linear light mode,
- Stripe dashboard restraint.

## Recommended tokens

```css
:root {
  --app-bg: #f5f4f1;
  --surface: #ffffff;
  --surface-soft: #faf9f7;
  --paper: #f8f3e8;

  --text: #1b1a18;
  --text-muted: #6f6b64;
  --text-faint: #98938b;

  --border: #e4e0d9;
  --border-strong: #d5cfc5;

  --wine: #7d2432;
  --wine-hover: #681d29;
  --gold: #aa8950;

  --success: #3f7b56;
  --warning: #a87823;
  --danger: #a13b3b;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.04);
  --shadow-md: 0 8px 24px rgba(0,0,0,.06);
}
```

## Progressive disclosure

Instead of showing seven rows of missing optional data, show:

```text
Details

Producer        Aegerter
Region          Burgundy
Designation     Grand Cru
Mevushal        No
Supervision     OU ...

3 optional details missing
```

The user can expand the missing optional details only when needed.

---

# 4. France / Italy approved map libraries

## Decision

**Seed every French and Italian appellation currently used by at least one wine. OSM may create drafts but must not auto-approve them.**

Use more authoritative boundary sources when practical. The CMS map visual should always be an M&M editorial rendering, never raw OSM styling.

## Data model

```sql
create table if not exists map_assets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  source text not null,
  source_locator text,
  geojson jsonb,
  svg text,
  status text not null default 'draft',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists map_assets_location_approved_idx
  on map_assets(location_id)
  where status = 'approved';
```

## Resolution hierarchy

```text
Approved appellation map?
  yes → use it
  no → approved subregion map?
        yes → use it
        no → approved region map?
              yes → use it
              no → approved country locator
```

```ts
export async function resolveBestMap(locationId: string) {
  const chain = await getLocationHierarchy(locationId);

  for (const location of chain) {
    const map = await db.oneOrNone(
      `
      select *
      from map_assets
      where location_id = $1
        and status = 'approved'
      order by approved_at desc
      limit 1
      `,
      [location.id]
    );

    if (map) return { map, resolvedLocation: location };
  }

  return null;
}
```

## OSM workflow

```text
OSM → draft → review → approve → reusable forever
```

Never:

```text
OSM → auto-approved → live catalog
```

## Review page

```text
Maps

France
  18 approved
  4 drafts
  2 missing

Italy
  15 approved
  2 drafts
  1 missing
```

Open draft:

```text
CHIANTI CLASSICO

[ large map preview ]

Source: OpenStreetMap
Match confidence: High

[ Approve ] [ Replace boundary ] [ Regenerate ]
```

## Rendering style

```tsx
<svg viewBox="0 0 600 500">
  <path
    d={countryPath}
    fill="#ebe6dc"
    stroke="#cfc7bb"
    strokeWidth="1.5"
  />

  <path
    d={appellationPath}
    fill="#8a2e3c"
    stroke="#8a2e3c"
    strokeWidth="1"
  />

  <circle cx={cityX} cy={cityY} r="4" fill="#2a2825" />
</svg>
```

Target QA set:

```text
Chianti Classico
Maremma
Barolo
Brunello di Montalcino
Saint-Émilion
Pessac-Léognan
Margaux
Pomerol
Champagne
Burgundy
```

---

# 5. Dropbox integration

## Decision

**Not considered unblocked until runtime health checks prove it.**

The source document says `files.content.read` was still pending. Therefore treat Dropbox as offline until verified.

Dropbox must not be a runtime export dependency.

Source priority:

```text
1. Approved CMS asset
2. Dropbox candidate
3. Existing M&M site image
4. Manual upload
5. Missing-image warning
```

Once a Dropbox/site image is chosen, copy it into CMS-controlled asset storage.

## Health check

```ts
export async function testDropboxConnection() {
  const token = process.env.DROPBOX_ACCESS_TOKEN;

  if (!token) {
    return {
      ok: false,
      configured: false,
      message: "DROPBOX_ACCESS_TOKEN is missing",
    };
  }

  const response = await fetch(
    "https://api.dropboxapi.com/2/users/get_current_account",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return {
    ok: response.ok,
    configured: true,
    status: response.status,
  };
}
```

Content-read test:

```ts
export async function testDropboxContentRead() {
  const response = await fetch(
    "https://api.dropboxapi.com/2/files/list_folder",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DROPBOX_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: process.env.DROPBOX_WINE_IMAGE_ROOT ?? "",
        recursive: false,
        limit: 1,
      }),
    }
  );

  return response.ok;
}
```

Do not display token values anywhere in the UI.

---

# 6. AI history retention

## Decision

**Nightly Vercel cron. Delete AI proposal/action records older than 60 days.**

Do not delete accepted business content, provenance, audit logs, or catalog snapshots.

## Route

```ts
// app/api/cron/cleanup-ai-history/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const cutoff = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  );

  const result = await db.transaction(async (tx) => {
    const proposals = await tx.query(
      `
      delete from ai_proposals
      where created_at < $1
      returning id
      `,
      [cutoff]
    );

    const actions = await tx.query(
      `
      delete from ai_actions
      where created_at < $1
      returning id
      `,
      [cutoff]
    );

    return {
      deletedProposals: proposals.length,
      deletedActions: actions.length,
    };
  });

  return NextResponse.json({ ok: true, cutoff, ...result });
}
```

## `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-ai-history",
      "schedule": "17 3 * * *"
    }
  ]
}
```

Environment:

```text
CRON_SECRET=<long-random-secret>
```

---

# 7. AI approval UX

## Decision

**Keep per-record approval and add a global AI inbox.**

Route:

```text
/catalog-admin/review/ai
```

Do not add a top-level `Claude` section.

## Inbox

```text
AI suggestions

12 waiting for review

Wine                           Field             Suggested action
-----------------------------------------------------------------
Corton Vergennes 2020          Tasting note      Shorten
Baffonero 2023                 Winery note       Improve
Pescaja Arneis 2025            Aging             Found from source
```

Detail:

```text
Current
[ text ]

Suggested
[ text ]

[ Use this ] [ Reject ] [ Edit suggestion ]
```

## Rule for factual proposals

A factual proposal cannot be accepted without a source.

```ts
export async function acceptAIProposal(
  proposalId: string,
  userId: string
) {
  return db.transaction(async (tx) => {
    const proposal = await tx.one(
      `select * from ai_proposals where id = $1 for update`,
      [proposalId]
    );

    if (proposal.status !== "proposed") {
      throw new Error("Proposal already reviewed");
    }

    if (
      proposal.proposal_type === "fact" &&
      !proposal.source_id
    ) {
      throw new Error("Factual proposal requires a source");
    }

    await applyProposalToEntity(tx, proposal);

    await tx.query(
      `
      update ai_proposals
      set status = 'accepted',
          reviewed_by = $2,
          reviewed_at = now()
      where id = $1
      `,
      [proposalId, userId]
    );
  });
}
```

User-facing AI vocabulary should be:

```text
Improve
Shorten
Find missing details
Check this wine
Compare vintages
Draft from sources
```

Not:

```text
Ask Claude
Claude assistant
```

---

# 8. Environment status page

## Decision

**Build it.**

Route:

```text
/catalog-admin/settings/environment
```

Display:

```text
Environment

Database                 Connected ✓
Anthropic API             Configured ✓
Dropbox token             Configured ✓
Dropbox file access       Working ✓
Asset storage             Working ✓
PDF renderer              Working ✓
Cron secret               Configured ✓

Last checked: 1:06 PM

[ Run checks again ]
```

Never show secret values.

```ts
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "DROPBOX_ACCESS_TOKEN",
  "CRON_SECRET",
];

export function getEnvironmentPresence() {
  return REQUIRED_ENV_VARS.map((name) => ({
    name,
    configured: Boolean(process.env[name]),
  }));
}
```

Store last-good health checks:

```sql
create table if not exists system_health_checks (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  status text not null,
  message text,
  checked_at timestamptz not null default now()
);
```

---

# 9. UX test persistence

## Decision

**Persist server-side.**

LocalStorage may still cache an unfinished run, but completed runs must sync to the database.

## Table

```sql
create table if not exists ux_test_runs (
  id uuid primary key default gen_random_uuid(),
  tester_user_id uuid references users(id),
  tester_name text,
  app_version text,
  commit_sha text,

  total_tests integer not null,
  passed_tests integer not null,
  failed_tests integer not null,

  results jsonb not null,

  started_at timestamptz,
  completed_at timestamptz not null default now()
);
```

## Types

```ts
type UXTestResult = {
  testId: string;
  title: string;
  passed: boolean;
  durationSeconds?: number;
  neededHelp: boolean;
  notes?: string;
};

type UXTestRun = {
  appVersion?: string;
  results: UXTestResult[];
};
```

## Save run

```ts
export async function saveUXTestRun(
  input: UXTestRun,
  userId: string
) {
  const passed = input.results.filter((r) => r.passed).length;
  const failed = input.results.length - passed;

  return db.one(
    `
    insert into ux_test_runs
    (
      tester_user_id,
      app_version,
      total_tests,
      passed_tests,
      failed_tests,
      results,
      completed_at
    )
    values ($1,$2,$3,$4,$5,$6::jsonb,now())
    returning *
    `,
    [
      userId,
      input.appVersion ?? null,
      input.results.length,
      passed,
      failed,
      JSON.stringify(input.results),
    ]
  );
}
```

History route:

```text
/catalog-admin/tests/history
```

---

# 10. UX acceptance threshold

## Decision

**Strict 6-of-6 for the six core workflows.**

If a tester needs verbal instruction, that test fails.

Pass requires:

1. correct outcome,
2. no verbal instruction,
3. no developer/admin tools,
4. no hidden shortcut,
5. no workflow error.

```ts
export function isUXRunAccepted(run: UXTestRun) {
  return run.results.every(
    (test) => test.passed && !test.neededHelp
  );
}
```

Report separately:

```text
Technical build: PASS
Core UX acceptance: FAIL — 5/6
```

A preview build may continue to exist, but it is not **Ready for Office Rollout** until 6/6 passes.

---

# 11. View-only customer account type

## Decision

**Defer to P2.**

Do not build customer authentication now.

Future-compatible schema can be added later:

```sql
create table catalog_customers (
  catalog_id uuid not null references catalogs(id) on delete cascade,
  customer_user_id uuid not null references users(id) on delete cascade,
  primary key (catalog_id, customer_user_id)
);
```

Future role:

```text
customer
```

Do not expose it yet.

---

# 12. Public website powered from CMS records

## Decision

**Architect for it, do not connect yet.**

Keep records presentation-neutral.

Good:

```text
wine_vintages.tasting_note
wine_vintages.mevushal
wine_vintages.appellation_id
```

Bad:

```text
wine_vintages.pdf_left_column_text
```

Future APIs may be:

```text
GET /api/public/wines
GET /api/public/wines/:slug
GET /api/public/producers/:slug
```

Keep them disabled/private for now.

---

# 13. QR wine pages

## Decision

**Defer until the catalog/export system is stable.**

Long-term target:

```text
https://www.mandmimporters.com/wine/<public-slug>
```

Near term:

1. use an existing approved M&M wine URL if available,
2. otherwise omit QR,
3. never create a dead placeholder QR.

---

# 14. Distributor-specific exports

## Decision

**P2 after core export reliability.**

Future model:

```sql
create table distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_asset_id uuid references assets(id),
  active boolean not null default true
);

create table distributor_price_tiers (
  distributor_id uuid references distributors(id),
  wine_vintage_id uuid references wine_vintages(id),
  price numeric(10,2),
  case_price numeric(10,2),
  primary key (distributor_id, wine_vintage_id)
);
```

Future UI:

```text
Make distributor copy

Distributor: [ Southern Glazer's ▼ ]
Include pricing: [x]
Use distributor logo: [x]

[ Create copy ]
```

Always create a new catalog version/copy; never mutate the master.

---

# 15. PDF/X workflow

## Decision

**Roadmap only until a commercial printer requests it.**

The current exporter should support:

```text
Print
Email
Web
```

PDF/X later requires:

- ICC profiles,
- CMYK conversion,
- bleed,
- trim/bleed boxes,
- crop marks,
- font validation,
- press-specific requirements.

Architect export as:

```text
HTML render
→ base PDF
→ optional postprocessor
→ final file
```

```ts
type ExportPreset =
  | "print"
  | "email"
  | "web"
  | "pdfx";

interface PdfPostProcessor {
  process(inputPath: string, options: unknown): Promise<string>;
}
```

Keep `pdfx` disabled until required.

---

# 16. Share expiration default

## Decision

**30 days by default.**

User options:

```text
7 days
30 days
90 days
No expiration
```

Only Admin may use `No expiration`.

```ts
const DEFAULT_SHARE_DAYS = 30;

export function defaultShareExpiration() {
  return new Date(
    Date.now() + DEFAULT_SHARE_DAYS * 24 * 60 * 60 * 1000
  );
}
```

Server enforcement:

```ts
if (
  input.noExpiration &&
  currentUser.role !== "admin"
) {
  throw new Error("Only admins can create non-expiring shares");
}
```

---

# 17. Watermarks

## Decision

**No watermarks burned into PDFs.**

Use a web-only draft banner for unapproved shared catalogs.

```tsx
{catalog.status !== "approved" && (
  <div className="draft-banner">
    Draft catalog · Not approved for distribution
  </div>
)}
```

The PDF remains clean.

---

# 18. Backups

## Decision

**Add independent nightly backup and quarterly restore verification.**

Recommended:

```text
Cloud SQL managed backups
+
nightly independent export to GCS
+
quarterly restore drill
```

Do not rely only on the managed backup checkbox.

## Example backup job

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/mandm-${TIMESTAMP}.dump"

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  "$DATABASE_URL" \
  > "$FILE"

gsutil cp "$FILE" \
  "gs://${BACKUP_BUCKET}/postgres/${TIMESTAMP}.dump"
```

Recommended retention:

- 14 daily,
- 8 weekly,
- 12 monthly.

## Backup status table

```sql
create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null,
  status text not null,
  object_path text,
  bytes bigint,
  started_at timestamptz not null,
  completed_at timestamptz,
  error_message text
);
```

Settings page:

```text
Backups

Cloud SQL automatic backup        Healthy
Independent nightly backup        Healthy
Last independent backup           Oct 8 · 3:12 AM
Last restore test                 Sep 30 · Passed
```

Quarterly restore drill:

1. restore most recent backup into isolated database,
2. run schema check,
3. verify row counts,
4. verify sample wine records,
5. mark restore test passed.

---

# 19. Error reporting

## Decision

**Add Sentry plus internal system health. No email digest required.**

Install:

```bash
npm install @sentry/nextjs
```

Environment:

```text
SENTRY_DSN
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
```

Filter sensitive headers:

```ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }

    return event;
  },
});
```

Internal status page:

```text
Settings → System

Application
Production deployment      Healthy
Database                   Healthy
Anthropic                  Healthy
Dropbox                    Degraded
PDF renderer               Healthy
Backup                     Healthy

Errors last 24 hours       3

[ View errors ]
```

---

# 20. Cross-cutting directives

## 20.1 AI is never factual authority

All AI actions follow:

```text
AI proposes
Human reviews
Human accepts
System writes
```

Never:

```text
AI researches
AI overwrites
User discovers later
```

### Writing fields

AI may propose freely:

- winery summary,
- tasting-note rewrite,
- food pairing copy,
- short description,
- editorial summary.

### Factual fields

AI proposal requires a source:

- vintage,
- blend,
- aging,
- mevushal,
- supervision,
- designation,
- appellation,
- bottle size,
- critic score.

---

## 20.2 Post-save validator

Every material wine edit should trigger validation.

```ts
export async function afterWineSave(
  wineVintageId: string
) {
  await normalizeWineVintage(wineVintageId);
  await recomputeCompleteness(wineVintageId);
  await regenerateValidationFlags(wineVintageId);
  await detectVintageChanges(wineVintageId);
}
```

Checks:

- malformed bottle size,
- unknown grape alias,
- contradictory vintage,
- designation mismatch,
- missing map,
- missing bottle image,
- suspicious vintage-to-vintage change,
- copy overflow,
- duplicate score,
- source conflict.

---

## 20.3 Vintage duplication rules

### Safe to carry

- producer,
- wine identity,
- region/appellation,
- bottle family,
- default supervision,
- map assignment.

### Carry but force review

- blend,
- aging,
- mevushal,
- bottle sizes,
- organic/biodynamic.

### Do not blindly carry

- critic scores,
- vintage-specific tasting note,
- `first_kosher_vintage = true`.

```ts
const duplicatedVintage = {
  producerId: previous.producerId,
  wineId: previous.wineId,
  vintage: newVintage,

  regionId: previous.regionId,
  appellationId: previous.appellationId,
  designation: previous.designation,

  bottleFamily: previous.bottleFamily,
  supervisionIds: previous.supervisionIds,

  grapes: previous.grapes,
  aging: previous.aging,
  mevushal: previous.mevushal,
  bottleSizes: previous.bottleSizes,

  firstKosherVintage: false,
  criticScores: [],
  tastingNote: null,
  status: "needs_review",
};
```

---

## 20.4 Catalog export remains the center of the product

Primary workflow:

```text
Wine Library
→ Select wines
→ Create catalog
→ Choose layout
→ Preview
→ Export
```

Layouts:

```text
Detailed
Editorial
Trade
Portfolio
Hybrid
```

Presets:

```text
Print
Email
Web
```

---

# 21. Recommended implementation sequence

## Sprint 1 — Operational certainty

1. Environment status page
2. Dropbox health checks
3. Sentry
4. AI cleanup cron
5. Backup monitoring

## Sprint 2 — Review and trust

1. Global AI inbox
2. Source conflict resolver
3. Post-save validator
4. Score conflict handling
5. Provenance accept/reject workflow

## Sprint 3 — Producer system

1. Searchable producer list
2. Producer workspace
3. Logo slot
4. Hero image
5. AI story tools
6. Producer preview

## Sprint 4 — Map completion

1. Query all currently-used France/Italy appellations
2. Seed draft geometry
3. Build map review screen
4. Approve current catalog maps
5. Add hierarchy fallback
6. QA representative wines

## Sprint 5 — UX acceptance

1. Persist UX test runs
2. Build test history
3. Run office testers
4. Require 6/6
5. Redesign failed workflows
6. Repeat until 6/6

---

# 22. Acceptance criteria

## Producer workspace

Pass when:

- producer can be found with search,
- bio can be edited without raw table access,
- logo can be assigned,
- AI can propose a bio,
- AI requires approval,
- producer can be previewed,
- changes flow into catalog renderers.

## Conflict resolution

Pass when:

- competing values are visible side by side,
- source is visible,
- one can be picked,
- manual third value can be entered,
- rejected values remain in history,
- conflict closes automatically after resolution.

## Maps

Pass when:

- every active France/Italy wine resolves to at least region level,
- priority wines resolve at appellation level,
- no raw OSM styling appears,
- drafts can be reviewed,
- approved maps are reused automatically.

## Dropbox

Pass when:

- token presence passes,
- account check passes,
- list-folder passes,
- content-read passes,
- chosen file is copied to CMS storage,
- export still works if Dropbox later becomes unavailable.

## AI retention

Pass when:

- route requires secret,
- >60-day AI history is removed,
- accepted business content remains,
- cron runs nightly,
- failure is observable.

## AI inbox

Pass when:

- every proposal is centrally visible,
- accept/reject works,
- factual proposals require source,
- no proposal silently writes.

## Environment page

Pass when:

- secret values are never displayed,
- set/missing is visible,
- service health is visible,
- last-good timestamp is visible,
- manual recheck works.

## UX tests

Pass when:

- completed runs persist,
- tester identity is captured,
- results are visible across devices,
- history page works,
- 6/6 is required for office-rollout acceptance.

## Share expiration

Pass when:

- default is 30 days,
- 7/30/90 options exist,
- no-expiry requires Admin,
- expired token fails safely.

## Draft protection

Pass when:

- PDFs remain clean,
- draft web share has a clear banner,
- approved web share has no draft banner.

## Backups

Pass when:

- independent nightly copy exists,
- status page shows last success,
- failure is visible,
- restore test is documented quarterly.

## Error reporting

Pass when:

- production exceptions are grouped,
- release/version context exists,
- sensitive headers are filtered,
- Admin can see degraded state without opening Vercel.

---

# 23. Suggested route/file structure

```text
app/
  (admin)/
    producers/
      page.tsx
      [id]/
        page.tsx

    review/
      page.tsx
      ai/
        page.tsx

    maps/
      page.tsx
      [id]/
        page.tsx

    settings/
      environment/
        page.tsx
      backups/
        page.tsx
      system/
        page.tsx

    tests/
      page.tsx
      history/
        page.tsx

  api/
    cron/
      cleanup-ai-history/
        route.ts

lib/
  ai/
    proposals.ts
    retention.ts

  provenance/
    conflicts.ts

  maps/
    resolve-map.ts
    seed-map.ts
    render-map.ts

  integrations/
    dropbox.ts
    anthropic.ts

  health/
    environment.ts
    checks.ts

  backups/
    status.ts
```

---

# 24. Navigation after these changes

Normal office user:

```text
Home
Wines
Catalogs
Producers
Images
Review
```

Admin-only under Settings:

```text
Users
Maps
Environment
Backups
System
Tests
```

Do not expose operational/technical pages in the main navigation.

---

# 25. Definition of done

This remaining pass is done only when:

## Trust

- AI never changes live factual data without approval.
- factual AI proposals show a source.
- source conflicts have an explicit resolver.
- provenance history is retained.

## Operational confidence

- environment page reports real integration status.
- Dropbox status is known.
- AI history is automatically cleaned at 60 days.
- backups are visible.
- production errors are observable.

## Publishing quality

- France/Italy maps are reviewed and reusable.
- producer story/logo is centrally managed.
- catalog renderers receive consistent producer data.

## Usability

- UX test results persist.
- core office rollout requires 6/6.
- no tester needs verbal instruction for the six core tasks.

## Scope discipline

Intentionally deferred:

- customer accounts,
- public CMS-backed wine browser,
- QR microsites,
- distributor overlays,
- PDF/X press pipeline.

The data model should permit them later, but none should delay completion of the internal publishing system.

---

# 26. Direct reply to `OPEN_QUESTIONS_2026-10-08.md`

```text
1. Build the full producer workspace.
2. Build the explicit source conflict resolver, preserving rejected provenance.
3. Phase 19 is not final. Light should be the default and should be simplified further.
4. Seed every currently-used France/Italy appellation. OSM produces drafts only; approve after review.
5. Dropbox is NOT considered unblocked until runtime health checks prove file-content access works.
6. Use a nightly Vercel cron for 60-day AI cleanup.
7. Build the global AI inbox in addition to per-record approval.
8. Build Settings → Environment.
9. Persist UX tests server-side.
10. Acceptance is strict 6-of-6 for the six core workflows.
11. Customer login is P2; do not build now.
12. Architect for public-site reuse but keep CMS isolated now.
13. QR public wine pages are deferred until core publishing is stable.
14. Distributor-specific exports are P2.
15. PDF/X is roadmap-only until a commercial printer requires it.
16. Share links default to 30 days; only Admin may choose no expiration.
17. No PDF watermarks. Use web-only draft banner for unapproved shared catalogs.
18. Add independent nightly backup plus quarterly restore verification.
19. Add Sentry plus internal system health; no email digest required.
```

Proceed in the implementation order defined above.
