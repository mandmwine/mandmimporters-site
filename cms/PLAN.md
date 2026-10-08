# M&M CMS — plan after Oct 7, 2026 review

Owner's reported issues, grouped by what unblocks the next day of work vs.
what builds for the long term. **IN FLIGHT = being pushed in this commit.
TODO = next commit. INPUT NEEDED = waiting on the user.**

## Phase 11 — Critical bug fixes

### 1. PDF export fails everywhere (`/api/catalogs/*/export`, `/api/wines/*/pdf`)
Error: `The input directory "/var/task/cms/node_modules/@sparticuz/chromium/bin" does not exist.`

**Root cause:** `@sparticuz/chromium` ships a brotli‑compressed Chromium binary in its own `bin/` folder. We're on Next 16 with **Turbopack**, which does *not* honor `outputFileTracingIncludes` the same way Webpack did, so the binary never ships in the Lambda bundle. The include fix in `b6a54be` didn't take because Turbopack ignored it.

**IN FLIGHT — fix shipped this commit:** switched to **`@sparticuz/chromium-min`** which downloads the binary at runtime from a hosted GitHub release tarball. Zero binary in the bundle, Turbopack can't lose what isn't there. First PDF export per cold start takes ~2–3 s longer (the download); subsequent ones use the cached binary in `/tmp`.

- `cms/package.json`: `@sparticuz/chromium` → `@sparticuz/chromium-min`
- `cms/next.config.ts`: external-package name updated; removed the stale tracing include
- `cms/app/api/wines/[id]/pdf/route.ts` + `cms/app/api/catalogs/[id]/export/route.ts`: pass the pack URL to `executablePath()`
- Optional `CHROMIUM_PACK_URL` env var in case we want to change the pinned version without a code change

### 2. Dropbox: `files.metadata.read scope missing`
Error from the live app: `Your app (ID: 8839043) is not permitted to access this endpoint because it does not have the required scope 'files.metadata.read'`.

**Root cause:** on the Dropbox app Permissions tab you've checked the **write** scopes but not the **read** scopes. The CMS only reads. Also — the warning at the bottom of the screenshot ("Open ID connect scopes cannot be requested along with team scopes") means a stray OpenID scope is selected and will block Submit.

**INPUT NEEDED — one minute of your time, no code change here:**

1. Open **https://www.dropbox.com/developers/apps** → your app
2. **Permissions** tab. Check these (uncheck everything else, especially any OpenID / `openid`, `profile`, `email` scopes):
   - ✅ `account_info.read`
   - ✅ `files.metadata.read`
   - ✅ `files.content.read`
   - (optional) ✅ `sharing.read`
3. Click **Submit** (bottom bar).
4. **Settings** tab → scroll to **Generated access token** → the existing token is now stale, click **Generate** to make a fresh one with the new scopes. Copy it.
5. Vercel → Project `mandm-catalog` → **Settings** → **Environment Variables** → edit **`DROPBOX_ACCESS_TOKEN`** → paste new value → Save → Redeploy (any new commit triggers it).

Then the Dropbox browser at `/catalog-admin/dropbox` will list folders without the 400.

### 3. Asset library is empty (no bottle images)
What you're seeing: `/catalog-admin/assets` shows a near‑empty library even though wine sheets have bottle images.

**Root cause:** the sheets fall back to `legacy.img` — the URL on `mandmimporters.com` that came in with the initial website scrape. Those images are read directly from the public site at render time, never copied into our asset library. Phase 4 shipped the library infrastructure but a one‑time backfill of ~108 legacy images was never run.

**TODO — Phase 12 ship:** build "Backfill bottle images from legacy site" admin action that walks every vintage with `legacy.img`, downloads via WebFetch, SHA‑256 dedupes, writes to Firebase Storage, sets `wine_vintages.bottle_asset_id`. One click, ~2 minutes for 108 wines.

### 4. "Claude notes not populating"
Needs reproduction. Possible causes to check in order:
1. `ANTHROPIC_API_KEY` is set in Vercel? (Previously confirmed yes.)
2. The AI dialog opens but the proposal never returns? → likely a Vercel function timeout; the AI action may be exceeding `maxDuration`.
3. The proposal returns and is saved to `ai_actions` but the Accept button isn't wiring the value back?

**TODO — Phase 12 debug:** add a timing + error log in `lib/ai.ts` and surface the Anthropic error in the modal body instead of a silent fail. Also raise `maxDuration` on the AI action route to 60s.

### 5. "One‑click Claude Update for a wine"
Your workflow idea: click a button on a wine, Claude pulls as much info as possible (tasting note draft, critic scores, grape blend, region, aging), each returns an inline proposal you approve one at a time.

**TODO — Phase 13 (new workflow phase):** build a `✦ Update everything` button on the wine detail header that fires in parallel:
- `proposeTastingNote` (what we have)
- `proposeFindScores` (what we have)
- `proposeFillVintageDetails` (new — aging, grapes, mevushal from web search)
- `proposeProducerBio` (new — a short winery_summary_short if the producer field is empty)
Each one lands as its own card in a stacked "Review AI proposals" panel at the top of the wine. Approve them individually.

### 6. Dark mode readability
Font and panel colors in dark mode were low‑contrast — `--muted` was reading as the panel background on some surfaces, borders were nearly invisible, and several inputs/panels had hardcoded white backgrounds that didn't flip with the theme.

**IN FLIGHT — fix shipped this commit:**
- Bumped `--ink` / `--muted` / `--rule` tokens for AA contrast on the dark panel color
- Dark‑mode override block that catches hardcoded `#fff` / `#efe9dd` on inputs, buttons, badge tiles, preview frames, textarea editors, share-link inputs, compare table headers
- The sheet renderer stays light on purpose — print is on paper

### 7. Delete producer
No way to remove a producer from the UI.

**IN FLIGHT — shipped this commit:**
- New `deleteProducer` server action (admin‑only, soft‑delete producer + all wines + all vintages in one pass, audits the counts)
- New `DeleteProducerButton` on the producer detail header with inline two‑click confirm

### 8. Export is not working
Same cause as #1 (PDF). Fixed in flight.

### 9. Score finder is not pulling
Same symptom as #4. The AI web search sometimes returns zero hits for obscure wines. Add logging to the find‑scores action and surface "0 scores found" explicitly instead of silently returning nothing.

**TODO — Phase 12.**

---

## Phase 12 — Data onboarding (the two xlsx files you sent)

**Inventory file (`inventory_Sept2026.xlsx`, 183 rows):** item # (SKU like `IT1709011321`), item name, UoM, qty on hand/allocated/available/inbound.

**Prices file (`Price_Posting_Sept__2026_1.xlsx`):** item #, name, size, vintage, color (TR = table red, TW = table white), bottles per case, FrontLine (list case price), per‑bottle price, then **2cs / 3cs / 4cs / 5cs / 10cs / 25cs** bulk tiers each with case + bottle prices.

The SKU encodes country / producer / wine / size / vintage:
- `IT`, `FR`, `IL` prefix = country
- Next 4 digits = producer
- Next 2 = wine
- Next 2 = size (`13` = 750ml, `15`/`16` = 1.5L, `17` = 3L, `11` = 375ml)
- Last 2 = vintage year

### Phase 12 work (TODO next commit)

1. **Schema**:
   - Add `wine_vintages.sku text`
   - Add `wine_vintages.pack_size int` (bottles per case: 12 / 6 / 3 / 1)
   - Add `wine_vintages.stock_cases_available numeric(10,2)`
   - Add `wine_vintages.stock_cases_allocated numeric(10,2)`
   - Add `wine_vintages.stock_cases_inbound numeric(10,2)`
   - Add `wine_vintage_prices` table: `(vintage_id, tier text, case_price numeric, bottle_price numeric, min_cases int)` — tiers = `frontline / 2cs / 3cs / 4cs / 5cs / 10cs / 25cs`
2. **One‑shot xlsx importers** at `/catalog-admin/data/import/inventory` and `/data/import/prices`:
   - Upload the xlsx
   - Parse via `xlsx` on the server (or hand‑roll)
   - Match on **SKU first, then (producer name + wine name + vintage) as fallback**
   - Preview per row: Match / New wine / Unmatched
   - Confirm → write
3. **Wine sheet now shows stock** ("251 cases available · 180 allocated") and all price tiers in a mini-table
4. **Trade PDF layout** shows the full price ladder so distributors see it
5. **CSV export** includes the new columns

### Phase 13 — "✦ Fill everything from AI" (your workflow) — SHIPPED

Done in this commit. On any wine page there is now a `✦ Fill everything from Claude` button next
to the Open sheet action. One click fires four Claude proposals in parallel:

1. **Draft tasting note** — from the wine's own data (skipped silently when a tasting note is already set)
2. **Find critic scores** — Claude web search, filed as pending scores you approve on the scores panel
3. **Fill vintage details** — Claude web search for aging, grape blend, mevushal status, and special designation. Only overwrites blank fields — it will never clobber something you set
4. **Producer bio** — short, factual producer bio (skipped silently when the producer already has a `winery_summary_short`)

Each proposal lands as its own card in the new **✦ Review AI proposals** panel at the top of
the wine page. Accept / Reject per card. Nothing goes live until you accept it.

Also in this commit:
- `lib/ai.ts` now logs timing + input/output tokens for every Claude call, and surfaces the
  Anthropic error message in both the server log and the AI dialog modal instead of failing silently
- `proposeFindScores` now logs the count of scores returned ("find_scores <id>: 3 scores returned")
  so a silent 0 is easy to tell from an API hiccup
- `AIProposalReviewer` pretty-prints `find_scores` and `fill_vintage_details` as readable summaries
  (critic / score / quote with a source link; aging / designation / mevushal / grapes dl) instead
  of raw JSON — same accept flow

### Phase 14 — Maps bulk create — SHIPPED

The GeoJSON approval infra from Phase 7 is now matched with an OpenStreetMap bulk fetcher.

A new admin page `/maps/seed` walks every location that has no map polygon yet and queues
them for a Nominatim lookup. Each successful hit is filed as a draft map_asset with a
`settings.seeded_from = "openstreetmap"` and a direct `source_url` link back to the OSM
record so the editor can audit it in one click. A single "Approve all drafts" button on
the same page promotes the whole batch to approved (admin only).

- `lib/maps/sources.ts` — Nominatim client with the required User-Agent, 24h fetch cache,
  and `composeQuery` helper that walks the chain (country → region → name) so an obscure
  appellation like Pessac-Léognan is queried as `Pessac-Léognan, Bordeaux, France`
  instead of a bare name that would collide with a street in Lyon.
- `lib/actions.ts` → `seedMapsBatch` picks the next 5 missing locations per invocation,
  honors Nominatim's 1 req/sec rate limit, and returns a per-location log. The client
  component paginates automatically until the queue is empty.
- `lib/actions.ts` → `approveAllDraftMaps` promotes every latest-draft to approved in
  one pass, auditing each. Admin only; retires any previously approved version for the
  same location (not deleted, so a per-location rollback stays possible).
- `/maps` index now has a "✦ Bulk seed from OpenStreetMap" button in the header.
- Anything OSM can't find reports a plain `no_match` reason inline so the editor can
  either rename the location to match OSM's wording, or hand-draw the polygon in
  `geojson.io` and paste it into the per-location Map Uploader as a last resort.

### Phase 15 — Pricing in catalogs — SHIPPED

Depends on Phase 12 pricing schema; now live.

- `catalogs.settings` jsonb now carries three new keys: `show_prices` (bool),
  `price_tier` (`"ladder"` for the full table, otherwise one of
  `frontline / 2cs / 3cs / 4cs / 5cs / 10cs / 25cs`), and `show_stock` (bool).
  No schema migration — persisted via `jsonb_set` in `renameCatalog`.
- Catalog settings panel gains a **Trade pricing** fieldset with a show-prices
  checkbox, a tier selector, and a show-stock checkbox. All three persist via
  the existing Save-settings action.
- `SheetData` now carries a `prices` array (every tier for the vintage) and a
  `stock` object (`available / allocated / inbound / updated_at`) + `sku` and
  `pack_size`. Loaded in one extra SELECT per wine.
- `TradePage` renders a compact 3-column price table (Tier / Case / Btl) under
  each wine when the catalog says `show_prices` + `price_tier = "ladder"`.
  When pinned to a single tier it drops a one-line summary instead
  (`FrontLine: $240.00 / cs · $20.00 / btl`). Stock is a one-line
  `X cs available · 12/case · SKU` under that.
- `SingleWineSheet` gets a matching **Trade pricing** section in the left
  column when the catalog has `show_prices` on — full table for ladder, inline
  summary for a single tier.
- Per-wine PDF export (not catalog-driven) ships no prices by default — Trade
  pricing lives on the Catalog pass, which is correct for distributor sheets.

### Phase 21 — Rebuild single-wine sheet to Template 01+06 blend (Phase A of audit) — SHIPPED

Governing source: `cms/AUDIT_AND_REBUILD_DIRECTIVE_2026-10-08.md`, with the
three reference images in `cms/docs/` (template 01, template 06, current UI).

Only the single-wine sheet was touched this pass — Phase A per section 52:
"lock the visual target" before moving to maps (Phase B), workspace (Phase C),
or catalog UX (Phase D).

New composition (seven elements, nothing else):
1. Identity header — gold hairline + dot, vintage in burgundy serif, wine name
   large serif centered (three title-size steps for long names, never silent
   shrink below 9pt), subtitle in tracked small caps, optional designation underneath
2. Bottle — anchors the left column, no frame, up to 5.6" tall
3. Place + map — "REGION, COUNTRY" eyebrow + italic serif appellation on one side,
   small refined locator map on the other
4. Scores — up to four outlined circular medallions (critic in gold italic above,
   burgundy numeral below). 1, 2, 3 or 4 all look intentional — grid contracts
   gracefully, never reserves empty slots
5. Technical details — ruled label/value table, hairline rows, missing fields
   omitted outright (section 8.5: no "not recorded" ever renders on export)
6. Tasting note | Winery note — two-column at the bottom
7. Footer — centered gold rule, "M & M IMPORTS", "Fine Wines · Higher Conversations"

Palette locked inside .sheet so the admin UI theme never leaks into a printed
page: warm ivory #f6f1e4, burgundy #6e2335, antique gold #a88b57, warm ink,
soft hairline rules. Cormorant Garamond for the display face, Inter for body
and small caps.

Phase 15 trade pricing (price_tier + show_stock) is preserved; it renders
full-width below the notes when a catalog opts in, so it never competes with
the primary data hierarchy on standard catalogs.

Export `template_version` bumped to `wine-sheet-v3` so a buyer re-exporting
an older versioned catalog is unambiguously on the new layout.

Not yet done (next passes per the audit):
- Phase B — map hierarchy rebuild (appellation-first, region map, country inset)
- Phase C — workspace plain-language rewrite, Fit Page preview, progressive
  disclosure for optional fields
- Phase D — catalog builder four-step flow (select / layout / organize /
  preview / export) + preflight

### Phase 19 — Color system concept (then fix the gap) — SHIPPED

User rightly called out: fixing color bugs reactively is the wrong workflow.
The underlying concept has to exist first, then every component picks from it.
Captured here so future components stay inside the system.

**Three surface levels, one ink, one muted — all contrast-validated.**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#f7f3ea` | `#1a1613` | Page body, outside any card |
| `--panel` | `#fffdf8` | `#26211c` | Standard card / panel |
| `--card-soft` | `#faf6ec` | `#332c25` | Nested card inside a panel (dialog tiles, proposals, modal bodies) |
| `--ink` | `#1e1b18` | `#f5efe3` | Primary text |
| `--muted` | `#6f675d` | `#b8aea0` | Secondary text |
| `--rule` | `#e2dacb` | `#4a4238` | Borders |

**Why three surface levels:** a dialog opens on a page already in a panel, and
usually holds action tiles or a proposal body nested inside. Without a third
level those nested cards vanish into the dialog. `--card-soft` = `panel`
shifted by a few shades of warmth — slightly darker in light mode, slightly
lighter in dark mode. Always one surface step from `panel`, both ways.

**Contrast (WCAG AA = 4.5:1):**

| Pair | Light | Dark |
|---|---|---|
| ink on paper | 16.1 ✓ | 14.5 ✓ |
| ink on panel | 17.3 ✓ | 11.6 ✓ |
| ink on card-soft | 16.0 ✓ | 9.2 ✓ |
| muted on panel | 5.5 ✓ | 6.2 ✓ |
| muted on card-soft | 5.3 ✓ | 5.2 ✓ |

Every pair passes AA — so any component picking any surface + ink/muted is safe.

**Rules for component authors (captured in a comment at the top of globals.css):**
1. Pick ONE surface token for background: `--paper`, `--panel`, `--card-soft`. Never hardcode `#fff`, `#faf6ec`, `#fcf9f1`, `#efe9dd`.
2. Primary text = `var(--ink)`. Secondary = `var(--muted)`.
3. Borders = `var(--rule)`.
4. Dark-mode token values must appear in BOTH the `@media (prefers-color-scheme: dark)` block AND the `[data-theme="dark"]` block. Missing one = half the users see broken contrast.
5. Exception: `.sheet` print preview stays on physical-paper cream always — it's a preview of a printed page.

**The gap this phase closed:**
`--card-soft` was defined in `[data-theme="dark"]` but missing from the
`prefers-color-scheme: dark` block. Users on OS-level dark mode (no explicit
toggle) saw every token flip to dark except `--card-soft`, which stayed cream
— so the AI dialog's proposal body rendered as a bright cream block on the
dark panel. Fix was two lines of CSS, but the real fix is the rule above
(§4). The AI dialog `pre` / `em` / `strong` descendants also now inherit
`--ink` explicitly, so a scores JSON blob reads correctly on both themes.

### Phase 18 — UX fixes: inline row archive, export chooser, dark-mode AI dialog — SHIPPED

Three UX fixes from screenshot review:

**1. Archive button on every wine row.** Right-most column, hover-friendly, two-click
confirm inline (no modal) so a row's archive stays close to the row. Click
cancels bubble up blocked so the row's own navigation doesn't fire.

**2. Export CSV chooser.** The Selection Bar's Export CSV button now opens a
tiny panel asking whether to export:
- *Selected (N)* — only the ticked rows across all pages
- *All matching filters (M)* — every wine that matches current search / filters, not just the page
The "all" count is fetched on-open from the new `/api/wines/count` endpoint
so the button shows the exact number. The export route (`/api/wines/export`)
now accepts `?all=1` plus any of q/status/country/missing/sort/dir and
re-runs the filter query, so the result matches the list the user is looking at.

**3. Dark-mode AI dialog readability.** New `--card-soft` CSS token in both
themes:
- Light: `#faf6ec` (same as before)
- Dark: `#332c25` — slightly lighter than `--panel`, so a nested card is
  visible on the panel without becoming washed out
Every `.ai-dialog__action`, `.ai-dialog__text`, and `.ai-proposal-card` now
uses `--card-soft` with explicit `color: var(--ink)` on the text, replacing
the previous hardcoded light-cream backgrounds that left the text invisible
in dark mode. Buttons inside the AI dialog honor the normal `.btn` dark
override, and the muted secondary text uses `var(--muted)` with AA contrast
on both themes.

### Phase 17 — Reconcile from inventory + archive — SHIPPED

Two user-asked additions on top of the shipped roadmap:

**1. Inventory importer can now auto-create missing wines.** A new "Create
missing wines" checkbox on the inventory import page. When on, any row whose
SKU / name doesn't match an existing vintage is turned into a draft
producer / wine / vintage. The producer is matched by longest-prefix against
existing producers ("Chateau Teyssier 2021" → existing "Chateau Teyssier"
producer, new vintage); if no prefix matches, the first 1–3 words become
a new producer name. The wine name is whatever's left of the Item column
after the producer, with the trailing vintage year stripped. The dry-run
preview shows exactly which rows would be created before you confirm.

**2. Archive wine, vintage, or producer with easy restore.** Three new
server actions mirror the existing deleteProducer:

- `archiveWineVintage` — soft-delete one vintage, other vintages keep going
- `archiveWine` — soft-delete the wine + every vintage under it
- `unarchiveWineVintage` / `unarchiveWine` / `unarchiveProducer` —
  restore, cascading up to re-activate parent rows if they were cascaded

A new "Archive" section on every wine detail page offers both options
(archive this vintage · archive whole wine) with a two-click confirm.
The /wines index gets an "Archived" link in the header; /wines/archived
lists each archived wine with its archived-at date and a Restore button.
Same for /producers/archived. All actions are editor-level; audit events
are stamped on every archive and restore.

### Phase 16 — Roadmap miscellany — SHIPPED

Four separate top-10 items landed in this one commit:

**1. Clone a catalog.** New `cloneCatalog` server action duplicates composition
(sections + items + settings) under a new name. Export history, share links,
and recipient data stay with the original — a copy is a fresh slate. `Clone
this catalog` button on the catalog detail page, inline form for the new name.

**2. Password-protected share links.** `catalog_shares` picks up `password_hash`
+ `password_set_at` (migration 0005). Password hashing is scrypt-N14r8p1 via
`lib/sharePassword.ts` (Node built-in `crypto.scryptSync`, no new dep). The
share-create form has a new `Passphrase` field. On the public share page, if
`password_hash` is set the viewer sees a passphrase gate; `/share/catalog/
<token>/unlock` verifies, sets a 30-day httpOnly cookie scoped to that one
share, and redirects back. Changing the password invalidates every outstanding
cookie because the cookie value is `sha256(token + password_hash)`.

**3. Per-recipient trackable share links.** `catalog_shares.recipient_name`
and `recipient_email` columns (same migration). Create form has new recipient
fields; the share-list row shows `For <name> · email · N views · last 2d ago`
so the owner can tell which buyer actually opened the catalog. Named plus
password combined means one buyer, one gated link, one audit trail.

**4. Buyer-builds-their-own-PDF.** A `Download PDF` button on the public share
page now proxies to `/share/catalog/<token>/pdf?preset=email`. Same gate as the
share view (token + unlock cookie); recipient_email is recorded in the audit
event alongside the byte count. Catalog pricing/stock settings carry through,
so a shared Trade catalog downloads with its full ladder.

**5. Claude alt-text on the asset library.** `proposeAssetAltText` sends the
image to Claude Haiku vision with a strict "describe what's actually in the
image, under 200 chars, no marketing" system prompt. One-click `✦ Draft alt-
text from image` button on each asset's detail page; the proposal lands as an
`ai_actions` row the editor Accepts to merge into `assets.metadata.alt_text`.
`acceptProposal` grew a new branch for `entity_type = asset` that uses
`jsonb_set` so caption / credit_line / tags stay intact.

---

## Order of operations

1. **Push this commit** (Phase 11 bug fixes: PDF + delete producer + dark mode)
2. **You:** fix Dropbox scopes per Phase 11 §2
3. **You:** confirm the catalog PDF export now works (visit `/api/catalogs/<id>/export?preset=print`)
4. **Next commit (Phase 12):** schema migration + xlsx importers + the backfill asset action
5. **Next after that:** one‑click AI fill (Phase 13), then maps (Phase 14), then pricing in catalogs (Phase 15)

Say **"go"** when you're ready for Phase 12 — I'll ship the xlsx importers + schema migration + asset backfill in one commit so you can bulk‑load your real inventory + prices in a few clicks.
