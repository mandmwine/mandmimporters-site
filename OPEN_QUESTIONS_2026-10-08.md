# M&M Importers CMS — Open Questions to Finalize

**Context.** Phases 13–32 are shipped on `main`. The audit's §47 "P1 immediately after P0" list is now complete except for a handful of items that need your judgment before I can execute. Below is every decision I'm sitting on — grouped by whether it blocks finishing, is operational hygiene, or is forward-looking scope.

Each item ends with a **suggested default** so you can skim and either agree, pick an alternative, or defer. Nothing here is urgent today — but we're close enough that an hour of your answers would let me run another unattended pass tomorrow with no further back-and-forth.

---

## A. Steering needed before I can execute remaining §47 items

### 1. Producer editing UX — what specifically hurts?

The audit flagged this but didn't name the pain. Candidates I've seen in the codebase:

- **Finding a producer** — producers list is a plain table; no search / filter.
- **Scattered fields** — country assignment is on `locations`, bio is on `producers.winery_summary_short`, logo is a wine_asset on each wine, no producer-level asset slot.
- **Bio editing** — single textarea, no AI assist (we have one for wines).
- **Preview** — no way to see how a producer renders on an Editorial or Portfolio page without exporting a catalog.

**Suggested default.** Build a proper producer workspace at `/producers/<id>` mirroring the wine workspace: workspace status pill, "almost ready" headline, AI bio button (we have `proposeProducerBio` already), logo asset slot that flows into Portfolio pages.

**Your call:** which pain do you actually hit? I'll fix that one first.

---

### 2. Source conflict resolution UX — how does a conflict get resolved?

Today `field_provenance.verification_status` can be `conflict`, and the Sources panel shows the count. But there's no explicit "pick a winner" workflow — the user has to open the record and type.

**Suggested default.** On the wine workspace Sources section, each field with `conflict_count > 0` grows a "Resolve" affordance that opens a side-by-side of the competing values with Pick / Pick / Edit buttons. Picking rewrites the field and marks the other provenance rows as `rejected` (keeping the history).

**Your call:** does that match how you actually think about reconciling two Wine Advocate scores for the same vintage, or does it miss something?

---

### 3. Light/default visual theme — what's weak?

Phase 19 locked a 3-surface palette (`--paper #f6f1e4`, `--panel #fffdf8`, `--card-soft #faf6ec`) with WCAG AA. If the current light theme feels wrong, I need something concrete to work from.

**Your call:** is this still open, or is Phase 19 enough? If open, the single most useful input would be a screenshot of a page and three words about what feels off.

---

### 4. France / Italy approved map libraries — scope and source

Phase 14 wired bulk seeding from OpenStreetMap Nominatim (1 req/sec). We can run it for all French and Italian appellations tomorrow if you give the green light.

**Suggested default.** Seed every French and Italian appellation that has at least one wine in the catalog, approve all drafts after visual review. OSM accuracy for established appellations is good; obscure ones get the country-silhouette fallback.

**Your call:**
- (a) Run the OSM seed now and approve on your schedule, or
- (b) Source commercial boundaries (SRTM / Natural Earth Admin-2 cost nothing; INAO shapefiles for France are public), or
- (c) Only prioritize appellations in a specific catalog you're preparing?

---

## B. Operational — need confirmation before I can trust the deploy

### 5. Dropbox integration — is it unblocked?

Compaction summary says the file-content scope was still pending user action: "flip `files.content.read` on, regenerate token, update `DROPBOX_ACCESS_TOKEN` in Vercel." Is this done? If not, the Dropbox importer and the "pull latest bottles" workflow are offline.

**Your call:** done / not done / abandoned (we live without Dropbox sync)?

---

### 6. AI history retention — 60 days enforced where?

Your stated constraint is **60 days**. There's no cron job in the repo today — if nothing runs, AI proposals pile up forever. Options:

- (a) Add a nightly cron on Vercel that deletes `ai_proposals` + `ai_actions` rows older than 60 days.
- (b) Postgres TTL via a trigger that fires on insert and schedules deletion (fragile).
- (c) Manual sweep when you remember.

**Suggested default.** (a). It's ~30 lines of code and one env check.

---

### 7. "Every AI needs my approval" — is the current UX enough?

The current `AIProposalsPanel` on the wine workspace lists `status='proposed'` rows with Accept / Reject buttons. Nothing writes to the live record without clicking Accept.

**Your call:** is that enough? Or do you want a global **AI inbox** at `/review/ai` that shows every pending proposal across every wine/producer so you don't have to open each record?

**Suggested default.** Build the global inbox — it's the natural pair of `/review` for review flags, and it lets you clear the queue in one sitting.

---

### 8. Env vars status page

Postgres password + Anthropic API key are never pasted in chat (your rule). But I have no way to confirm from here that both are set in Vercel. A tiny **Settings → Environment** page would list every required var and show "set" / "missing" (never the value) + the last-good timestamp.

**Suggested default.** Build it. ~1 hour.

**Your call:** yes / skip?

---

## C. Phase 31 UX tests — follow-up

### 9. Should test results persist server-side?

Right now Phase 31 is `localStorage`-only. If Maria runs tests on her laptop and David runs tests on his, you can't see consolidated results — and if either clears browser data, their run is gone.

**Suggested default.** Add a `ux_test_runs` table that captures each completed run (one row per run, JSON body with the six results). A new `/tests/history` page lists past runs. Keeps the harness page working offline-first; cloud sync just happens on "Finish run".

**Your call:** server persistence yes / stay local-only / skip?

---

### 10. Is "6 of 6 passed" the acceptance threshold?

The audit says *"If the tester needs verbal instruction, the workflow should be redesigned."* — implying any failed test is a build-reject. But some tests are harder than others. If a tester fails Test 6 ("why isn't this wine ready?") that's maybe redesign-worthy; if they fail Test 5 ("make this into a Trade catalog") the wizard clearly needs help.

**Your call:** strict 6-of-6, or acceptable to ship with 5-of-6 if Test 5/6 pass? This affects what counts as "build accepted" for everything we're doing.

---

## D. Forward-looking (audit §48 — P2 scope)

Each is a real project; the question for each is whether it goes next or stays parked. **Don't try to answer all of these** — just mark which, if any, I should scope.

### 11. View-only customer presentation account type
A "customer login" that shows them only the catalogs the admin has flagged. Different from the current token-share links (which are stateless and single-catalog).
**Suggested shape:** add a `role = "customer"` to `users`, catalogs get a many-to-many `catalog_customers` table, customer login lands on a personalized index.

### 12. Public website powered from catalog records
mandmimporters.com's catalog browser could be driven from the CMS. Keep the WordPress marketing pages, replace the wine browser.
**Alternative:** keep separate. The current `/catalog-admin` is quite isolated and that's working.

### 13. QR wine pages
`qr_svg` is already on the trade sheet. The QR currently points to the wine on mandmimporters.com. Should it instead point to a public M&M-branded page we render, with pricing, scores and the current importer story?

### 14. Distributor-specific exports
Clone a catalog + overlay with a distributor's logo + their price tier only. Might be a one-click "Make a distributor copy" from the share dialog.

### 15. PDF/X workflow for commercial print
Different ballgame — needs ICC color profiles, bleed, embedded fonts, press-ready specs. Only worth doing if you're actually sending catalogs to an offset printer.
**Your call:** is this on the roadmap at all, or are inkjet/laser prints the ceiling?

---

## E. Build hygiene / small clarifications

### 16. Share expiration default
Current: each share lets the user pick an `expires_at`. No default.
**Suggested default:** 30 days unless the user picks otherwise. Prevents forgotten shares from leaking indefinitely.
**Your call:** 30 days / 90 days / no default (status quo)?

### 17. "No watermarks" — absolute?
Current: all exported PDFs are clean, no watermarks of any kind. Fine for finished deliverables, but what about a **"DRAFT / NOT FOR DISTRIBUTION"** overlay on shared catalogs that haven't been marked `status='approved'`? Would protect against someone forwarding a half-finished portfolio.
**Your call:** absolute no-watermark / allow a draft overlay only for status=working / fine as-is?

### 18. Backups
Postgres is on Cloud SQL — Google does automated backups by default. But is anyone verifying that restores work?
**Suggested default:** add a nightly `pg_dump` to GCS alongside the Google-managed backups, plus a **Settings → Backups** page showing the last successful dump timestamp.
**Your call:** worth building, or trust Google?

### 19. Error reporting
Vercel logs are enough today, but a 500 could sit unnoticed. Options:
- Sentry (free tier covers us)
- A nightly digest email summarizing errors (but you said no email notifications)
- Just a Settings page that pulls the last 24h of Vercel errors
**Your call:** any / none / defer?

---

## F. Nothing is blocking today

If every item above sits for a week, the system continues to work. The two items in section B (6 and 7) are the only ones with any ongoing cost — AI history growing, no bulk AI review inbox. Everything else is nice-to-have.

---

## How to answer this

Reply inline — "1: build the workspace; 5: done; 6: a; 7: global inbox; 8: yes; …" — or copy the headings you care about and strike out the rest. Any question you don't answer, I'll either default per the suggestions above (if obvious) or leave for the next pass.
