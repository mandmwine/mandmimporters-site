# Implementation roadmap — M&M catalog CMS

Reconciles **CATALOG_BUILDER_INVENTORY.md** (features seen in Flipsnack,
Catalog Machine and Catalogly) with what we've already built across the
10 phases + 6 UX passes. The inventory covers general catalog builders;
some items don't fit a boutique wine importer (shopping cart,
inventory enforcement, Shopify sync). Those are marked **N/A**.

Column key:
- ✅ = shipped
- 🟡 = partial / stub
- ⏳ = next pass candidate (realistic for us)
- 💡 = good idea, not yet planned
- N/A = doesn't fit this business

---

## 1. Product data and import

| Feature | Status | Notes |
|---|---|---|
| Central product database (one record per wine) | ✅ | `producers → wines → wine_vintages` |
| Custom fields per category | 💡 | Would need a new `custom_fields` table; low priority — our vintages have ~20 fixed fields that cover everything |
| Categories | 🟡 | We have `wines.category` (red/white/rose/etc.) but no per-category attribute set |
| Collections (flexible groupings) | ✅ | `catalog_sections` + `catalog_items` do this |
| Manual add + quick edit grid | 🟡 | Edit grid exists via the wines list, but no quick-add row |
| **CSV / Excel import** | ✅ | Shipped in pass 6 at `/wines/import` |
| Google Sheets import | ⏳ | Nice follow-up to CSV — paste a sheet URL, we pull live |
| Import from product web URL | 💡 | Could use Claude to scrape producer pages for new wines |
| Store sync: Shopify / Etsy / etc. | N/A | Wholesale distribution, not retail |
| PDF import as pages | ⏳ | Useful for legacy catalogs — upload a PDF, we attach pages |
| PDF import with data extraction | 💡 | Claude can read a PDF and extract wine fields |
| **Dropbox import** | ✅ | Shipped in Phase 5 |
| Image library | ✅ | `/assets` with search/filter/bulk |
| Barcodes on products | 💡 | GS1 codes for the wholesale set, if useful |
| Stock photos | N/A | We use the user's own bottle photos |

## 2. Pricing and variants

| Feature | Status | Notes |
|---|---|---|
| Variants with options | ⏳ | `bottle_sizes[]` is on `wine_vintages` but not treated as variants |
| Per-variant price / SKU / image | 💡 | Would need a `wine_variants` table — low priority unless prices vary by size |
| **Tiered price levels** (wholesale / retail) | ⏳ | High value — the user is a wholesaler |
| Wholesale discount by percent | ⏳ | Derive from retail |
| Price override per catalog | 💡 | e.g. a special-event catalog with special prices |
| Price import by CSV | ⏳ | Could extend the existing CSV importer |
| Compare at price | 💡 | "Was X, now Y" |
| Currency format / rounding | 💡 | Mostly USD here |
| Show / hide prices per catalog | ⏳ | High value — some catalogs are copy-only, others include wholesale |

## 3. Inventory

| Feature | Status | Notes |
|---|---|---|
| Stock quantity per vintage | ⏳ | Add `wine_vintages.stock_cases int` — useful for allocation planning |
| In-stock filter | ⏳ | Trivial once the column exists |
| Stock check at order time | N/A | We don't take orders |
| Out-of-stock hidden automatically | ⏳ | Status: `discontinued` already does this |

## 4. Catalog editor

| Feature | Status | Notes |
|---|---|---|
| Drag-and-drop page builder | ✅ | Sections + items are drag-reorder (pass 2) |
| Zoom in / out | ✅ | Live preview has zoom controls |
| Drag products into placeholders | 🟡 | We select wines in bulk and add — no visual placeholder yet |
| Add many at once | ✅ | Selection bar |
| Edit in place | ✅ | Autosave on long text; EditablePanel on everything else |
| Pages panel | 🟡 | Sections list is close but not thumbnail-based |
| Double-page spreads | 💡 | Nice for a printed book |
| Resize the whole document | N/A | Fixed to US Letter |
| Master layer | ⏳ | Theme tokens are our equivalent — not element-level yet |
| **Headers and footers** | ✅ | Per sheet template |
| Automatic page numbers | ✅ | In PDF export |
| **Table of contents** | ✅ | Catalog export inserts a TOC |
| Product index (alphabetical / SKU) | ⏳ | Easy addition to the catalog section kinds |
| Rulers, guides | N/A | Our layouts are template-driven, not free-form |
| Tables | 💡 | A technical specs table would be useful |
| **Undo** | ✅ | UndoToast system (pass 3) |
| **Version history** | ✅ | `catalog_versions` on every export; UI needs polish |
| Right-click menu | 🟡 | Component built in pass 6, needs to be wired into list rows |
| Keyboard shortcuts | ✅ | ⌘K palette, ⌘S save, ?, J/K, N (pass 1–5) |
| **Comments for team review** | ⏳ | Needs a `comments` table — would unlock team workflow |
| **Notes on pages (internal)** | ⏳ | Low effort — add a `notes` field per section |
| Clone a catalog | ⏳ | Copy sections + items in a single server action |
| Custom CSS | 💡 | Theme tokens cover 90% without this |
| Dynamic placeholders | 🟡 | Theme tokens cover brand colors / fonts; could extend |

## 5. Layouts and templates

| Feature | Status | Notes |
|---|---|---|
| Ready-made templates | ✅ | Template 05 (detailed), Lineup, Trade |
| Products per page presets | ✅ | Lineup = 2–6, Trade = 8+, Detailed = 1 |
| Automatic product grid | ✅ | Lineup / Trade auto-paginate |
| Product card template | 🟡 | Hard-coded in `SingleWineSheet.tsx` — not editable |
| Tabular price list | ⏳ | Natural extension of CSV export view |
| **Line sheet** (compact wholesale, SKUs + prices) | ⏳ | Trade sheet is close but not quite |
| **Spec / data sheet** (one wine, all attributes) | ✅ | That's Template 05 |
| Order form layout | N/A | We don't take orders |
| **Lookbook** (image-led, few words) | ⏳ | Nice for a Chanukah / holiday catalog |
| Label sheets | 💡 | Would need bottle label specs |
| Save my own templates | 💡 | Right now template choice is per section; could save presets |
| Locked templates (brand lock) | 💡 | Theme tokens already enforce colors / fonts |
| Share templates with team | N/A | Already one organization |
| **Mix layouts in one catalog** | ✅ | Each section picks its own render mode |
| Master catalog (assembled from others) | 💡 | |
| Clone a catalog | ⏳ | |

## 6. Automation and sync

| Feature | Status | Notes |
|---|---|---|
| One-click refresh | ✅ | Our data is live — the catalog always pulls current values |
| Automatic update on product change | ✅ | Same |
| Scheduled updates | N/A | Nothing to pull from |
| Include / exclude rules | ⏳ | Rule-based wine selection would be nice for recurring catalogs |
| Collection filter and sort per catalog | 🟡 | We hand-pick wines; auto-filter rules not built |
| Catalog generator from feed + template | 🟡 | Catalogs are templated but hand-built |
| Many catalogs from one database | ✅ | By design |

## 7. AI

| Feature | Status | Notes |
|---|---|---|
| Build a catalog from a conversation | 💡 | "Build me a Chanukah 2026 selection of 20 reds" → auto-suggest |
| **AI import from URL / photo / PDF** | 💡 | Big win: scrape producer pages or OCR a tech sheet |
| AI picks a template | 💡 | |
| AI drafts text (tasting notes, voice) | ✅ | Phase 3 |
| **Alt-text generation** | ⏳ | Trivial — Claude on each asset |
| Translation | 💡 | If you ever do a French / Hebrew edition |
| Monthly credit allowance | 🟡 | Anthropic bills direct; no UI for budgets yet |

## 8. Interactive content

| Feature | Status | Notes |
|---|---|---|
| Links on PDF | ✅ | Native PDF behavior |
| Product tag hotspots | 💡 | For a flipbook-style web catalog |
| Video / audio | N/A | Not for a print catalog |
| QR codes | ✅ | On the trade sheet; also for /share/wine/[slug] |
| Lead form | 💡 | "Request pricing" form on the public share |

## 9. Viewer experience

| Feature | Status | Notes |
|---|---|---|
| Page flip view | 💡 | Our share is scroll — flipbook library (eg turn.js) if desired |
| Single-page scroll | ✅ | /share/catalog default |
| Works on phone / tablet | ✅ | Responsive |
| Nothing to install | ✅ | Hosted web view |
| Text search inside catalog | ⏳ | Cmd+F works; could add an in-page search box too |
| Page thumbnails overview | ⏳ | Section list already acts as this on the admin side |
| Right-to-left reading | 💡 | If Hebrew edition is ever a thing |

## 10. Publishing, privacy and access

| Feature | Status | Notes |
|---|---|---|
| Draft and published states | ✅ | `wine_vintages.status` + `catalogs.status` |
| **Unlisted / direct link** | ✅ | `/share/catalog/[token]` |
| Password | ⏳ | Trivial extension to catalog_shares |
| Email required to view | ⏳ | Same |
| Specific people only | 💡 | Would need audience lists |
| **Expiry on share link** | ✅ | `catalog_shares.expires_at` |
| Revoke | ✅ | `catalog_shares.revoked_at` |
| **Leak watermark on shared views** | ⏳ | Stamp viewer email on each page |
| Schedule publish / unpublish | ⏳ | Expiry handles unpublish; needs a start-time too |
| Edit + republish at same link | ✅ | Share link is permanent until revoked |
| Custom link name | 💡 | Pretty URLs instead of random tokens |

## 11. Output and print

| Feature | Status | Notes |
|---|---|---|
| **PDF export** | ✅ | Phase 2 — three presets (print / email / web) |
| **Web and print quality options** | ✅ | Device scale factor per preset |
| Print bleed | ⏳ | Letter size now; CM-style bleed for prepress is a small addition |
| Page sizes | 🟡 | US Letter only; A4 is one CSS variable |
| Social formats (4:5, 9:16, 1:1) | 💡 | For sharing a single wine to Instagram |
| Ink-saving PDF | 💡 | |
| **GIF / MP4** | 💡 | Share one wine as a motion piece on social |
| Images beyond PDF | ⏳ | Export a single sheet as JPG / PNG — easy via puppeteer |
| Accessible PDF (tagged) | 💡 | |
| **High resolution** | ✅ | Print preset is 2× |

## 12. Sharing and embedding

| Feature | Status | Notes |
|---|---|---|
| **Hosted link** | ✅ | /share/catalog/[token] |
| **Embed on a website** | ⏳ | Iframe embed with the share token |
| **QR code for the catalog** (as well as per wine) | ⏳ | Add to catalog detail |
| Social sharing (title + preview image) | ⏳ | Needs OG image generation per catalog |
| Send by email | 💡 | We have the ANTHROPIC_API_KEY but no email service wired |
| Email platform hookups | 💡 | Mailchimp / HubSpot — probably overkill |
| **Bookshelf** (public page listing all shared catalogs) | ⏳ | Nice for the public site |
| Custom domain | 💡 | Already on mandmimporters.com |
| **Individually trackable links** | ⏳ | One token per recipient, so analytics can tell who viewed |

## 13. Ordering and payments

| | | |
|---|---|---|
| Not implementing | N/A | M&M is wholesale through distributors — orders aren't placed through this app |

## 14. Online showroom

| Feature | Status | Notes |
|---|---|---|
| Searchable product site | 🟡 | /share/wine/[slug] exists per-wine; no browse index |
| Browse by category | ⏳ | Easy — reuses the wines list filters |
| Featured products | 💡 | Admin-flagged "showcase" wines |
| **Buyer builds their own mini-PDF** | 💡 | "Trade customer picks 10 wines, downloads a sheet" |
| **Buyer requests a quote** | 💡 | Form submission → email |

## 15. Analytics

| Feature | Status | Notes |
|---|---|---|
| **Views over time** | 🟡 | We store `view_count` + `last_viewed_at` on share links; no chart yet |
| **Per-page statistics** | 💡 | Needs per-event tracking |
| Click tracking (which wines get clicked) | 💡 | Same |
| Source breakdown (referrer / browser) | 💡 | |
| **Per recipient link tracking** | ⏳ | Pairs with per-recipient share tokens |
| Google Analytics | 💡 | Trivial add |
| Export statistics to CSV | ⏳ | |

## 16. Branding

| Feature | Status | Notes |
|---|---|---|
| Logo, colors, fonts | ✅ | Theme tokens (Phase 10) |
| **Brand kit** (saved assets for the team) | ✅ | Theme tokens + asset library |
| Custom background | ⏳ | Theme token |
| Color swatches for variants | 💡 | |
| Branded viewer frame | 💡 | Share page footer already shows M&M logo |
| **Save settings as defaults** | ⏳ | Catalog creation pulls from theme tokens — already partially does this |

## 17. Team and accounts

| Feature | Status | Notes |
|---|---|---|
| Several users | ✅ | Firebase + `users` table |
| **Roles and permissions** | ✅ | admin / editor / viewer |
| Feature-level permissions | 💡 | Current per-feature `canEdit` is coarse |
| Activity log per user | ✅ | `audit_events` + UpdatedMeta |
| Several workspaces | N/A | One brand |
| Agency mode | N/A | |
| **Folders and labels for catalogs** | ⏳ | A "season" dropdown exists; folders would be nicer |
| Single sign on | 💡 | Firebase handles Google already |

## 18. Integrations and API

| Feature | Status | Notes |
|---|---|---|
| **Zapier** | 💡 | Useful for e.g. "when a wine is published, post to Slack" |
| **REST API** | 🟡 | We have internal API routes but not a public API |
| Webhooks | 💡 | |
| HubSpot / Salesforce | 💡 | |
| **Dropbox** | ✅ | Phase 5 |
| **Google Drive** | 💡 | Second-pass to Dropbox integration |
| Assistants and LLMs | ✅ | Anthropic (Phase 3) |

## 19. SEO, accessibility, compliance

| Feature | Status | Notes |
|---|---|---|
| SEO on shared pages | 🟡 | We `noindex` admin; share pages need titles + OG tags |
| Social preview (OG tags) | ⏳ | Needs per-catalog OG image |
| Accessibility (alt text, labels) | ✅ | Pass 2–5 |
| **Several languages** | 💡 | If Hebrew/French catalog is ever a thing |
| Compliance docs | 💡 | |

---

## Top 10 realistic picks for the next couple of passes

Ranked by **impact for M&M** × **effort to build**.

1. **Price tiers + show/hide prices per catalog** — the user is a wholesaler. Reds/whites rows get `wholesale_price` / `retail_price`, each catalog gets a `show_prices` flag.
2. **Clone a catalog** — one-shot server action; makes "Spring 2026 → Fall 2026" a 5-second task.
3. **Embed code + bookshelf page** — a public `/share/all` listing every live catalog on the public site, iframe snippet per catalog.
4. **Password / email-gate on share links** — small schema addition to `catalog_shares`; useful for distributor-only catalogs.
5. **Per-recipient trackable share links** — Alice-only token with her own view count; lets analytics tell you *who* actually opened the catalog.
6. **Alt-text generation via Claude** on asset library — one click per asset or batch "generate for everything that's missing."
7. **In-catalog text search box** — client-side; indexes titles + tasting notes.
8. **Buyer-builds-their-own-PDF** on the showroom — tick wines on the public catalog, download a single-wine sheet set.
9. **CSV import for prices** — extend the existing wine importer with a prices-only mode.
10. **PDF import of a legacy catalog** — upload a PDF, each page becomes an attached asset; Claude extracts wine names into draft rows.

Items I'd keep **as‑is / skip**: shopping cart + checkout, inventory enforcement, Shopify sync, agency mode, master layer, custom CSS, white label (we already own the domain).

---

## Known broken / fixed since last pass

- **PDF export** 500ing with `/var/task/cms/node_modules/@sparticuz/chromium/bin does not exist` — fixed in commit `b6a54be` (added the bin folder to Next's output file tracing). Awaiting deploy confirmation.
