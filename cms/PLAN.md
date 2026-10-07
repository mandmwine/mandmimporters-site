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

### Phase 13 — "✦ Fill everything from AI" (your workflow)

As described in Phase 11 §5. Big win.

### Phase 14 — Maps bulk create

Your ask: create maps for every appellation. We already have the geoJSON approval infra from Phase 7. What's missing is the actual geoJSON data.

**TODO:**
- Audit distinct appellations/regions/countries in your catalog (from `wine_vintages.location_id`)
- Fetch Natural Earth country outlines (public domain) for all countries represented
- Fetch OSM Overpass for the specific appellations (Chianti Classico, Saint‑Émilion, Margaux, Pessac‑Léognan, Pomerol, Nuits‑Saint‑Georges, Pommard, Volnay, Puligny‑Montrachet, Beaune, Monthelie, Castellare di Castellina/Chianti, Sancerre, La Clape, Maremma Toscana, Judean Hills, Galilee…)
- Script in `scripts/seed-maps.ts` that writes a draft `map_asset` per location
- Admin "Approve all drafts" bulk action
- Any appellation we can't find a free dataset for, I'll report back with the list and we can hand‑draw via geojson.io

### Phase 15 — Pricing in catalogs (from the roadmap top‑10)

Depends on Phase 12 pricing schema.
- Catalog setting: `price_tier` (which column to show)
- Catalog setting: `show_prices` on/off per catalog
- Trade sheet rendering shows the ladder

### Phase 16 — Follow‑ups from the roadmap

Lower priority but on deck:
- Clone a catalog (1 server action)
- Password / email gate on share links (small schema add)
- Per‑recipient trackable share links
- Alt‑text generation via Claude on asset library
- Buyer‑builds‑their‑own‑PDF on `/share/catalog`
- Add producer/wine search bar inline on `/wines/import` preview to help resolve typos

---

## Order of operations

1. **Push this commit** (Phase 11 bug fixes: PDF + delete producer + dark mode)
2. **You:** fix Dropbox scopes per Phase 11 §2
3. **You:** confirm the catalog PDF export now works (visit `/api/catalogs/<id>/export?preset=print`)
4. **Next commit (Phase 12):** schema migration + xlsx importers + the backfill asset action
5. **Next after that:** one‑click AI fill (Phase 13), then maps (Phase 14), then pricing in catalogs (Phase 15)

Say **"go"** when you're ready for Phase 12 — I'll ship the xlsx importers + schema migration + asset backfill in one commit so you can bulk‑load your real inventory + prices in a few clicks.
