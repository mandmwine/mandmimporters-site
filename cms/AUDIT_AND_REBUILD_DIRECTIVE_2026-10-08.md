# M&M Imports Catalog CMS
## Exhaustive UX, Catalog Renderer, Map, and Publishing Audit

**Date:** October 8, 2026  
**Repository:** `mandmimporters-site-main`  
**Scope:** Private catalog CMS, single-wine sheet, wine maps, catalog builder, AI assistance, assets/Dropbox, PDF publishing, and office-user UX  
**Status:** The current application is a meaningful technical build, but the primary experience still misses the approved design and usability target. This document is the governing rebuild directive for the next pass.

---

# 1. Executive Summary

The current repository has progressed significantly from the earlier prototype. It now contains real implementations for:

- Catalogs and catalog items
- Multi-wine rendering modes
- AI/Claude infrastructure and proposal workflows
- Dropbox integration
- Asset management
- Map storage and seed tooling
- Wine selection and bulk actions
- Catalog version/export infrastructure
- Source/provenance and review tooling
- Live single-wine preview
- Role-based access patterns

Those are useful foundations and **should not be discarded**.

However, the two most visible parts of the product still miss the bullseye:

1. **The single-wine page does not look like the approved template.**
2. **The admin experience still feels like a developer/admin database rather than an Apple-simple publishing product.**

The map system has also moved in the wrong visual direction. The current default map is essentially a country silhouette with a pin and a tiny label. That is factual, but it is not the elegant, appellation-led wine map system that was designed.

The next update should therefore be treated as a **presentation and workflow rebuild on top of the existing backend**, not another small styling pass.

The goal is:

> **Make the software feel like a simple publishing application, with the complexity hidden underneath.**

A first-time office user should be able to:

- open a wine
- understand what is missing
- edit it
- add an image
- accept or reject an AI suggestion
- preview the page
- select wines
- create a catalog
- choose Detailed / Editorial / Trade / Portfolio
- export a PDF

without training.

If the user needs to understand database terminology, asset IDs, provenance architecture, render engines, zoom percentages, or internal workflow states, the interface has failed.

---

# 2. Reference Files Included With This Audit

This repository package includes three visual references under `cms/docs/`:

- `current-ui-reference-2026-10-08.png`
  - Screenshot of the current wine editing workspace and live preview.
- `approved-reference-template-01.png`
  - One of the approved clean single-wine directions.
- `approved-reference-template-06.png`
  - The simplest approved direction and the strongest base for the universal wine sheet.

The final single-wine sheet should be treated as a controlled blend of **Template 01 + Template 06**.

Do not use the earlier, busier editorial poster concepts as the standard technical page.

---

# 3. Product Definition

This is not primarily a public website feature.

It is a private catalog publishing CMS for M&M Imports.

The primary jobs are:

1. Maintain accurate structured wine records.
2. Maintain approved bottle imagery.
3. Maintain reusable appellation maps.
4. Use AI to help improve and complete information without silently overwriting facts.
5. Select wines and generate different catalog presentations.
6. Export professional PDFs.
7. Preserve exact historical catalog versions.

The public website may eventually reuse the same data, but the CMS should first be optimized for the internal office workflow.

---

# 4. Original Owner Design Direction

The owner answers remain the governing design brief.

## Brand feeling

Priority order:

1. **Luxury**
2. **Education**
3. **Authority**

The catalog should be inviting rather than stiff.

## Visual direction

A blend of:

- European high-fashion wine magazine
- Boutique importer
- Contemporary luxury

The catalog should be information-rich, but should no longer feel crowded.

## Key visual directives

- More modern and new
- More luxurious than the old catalog
- Bottle remains the dominant product image
- One full page per wine for detailed sheets
- Bottle placement can move when justified
- Current blue-gray identity is rejected
- Richer, more dramatic palette is acceptable
- Category color families are acceptable
- Typography should be modern/classic balanced
- Wine names should be larger and more dramatic
- Producer and wine names should be typographically distinct
- Maps remain important
- Maps must be custom, refined, and consistent
- Region/appellation is more important than exact winery coordinates
- Critic scores should be prominent
- Score presentation should be clean and individual
- Premium designations such as Grand Cru / Premier Cru / DOCG / Single Vineyard should be emphasized
- Kosher supervision should remain factual and secondary
- Section dividers, contents, regional index, company intro, and back matter should be strong

## Owner's three highest priorities

1. **More accurate information**
2. **More luxurious layout**
3. **Easier to read**

Any design or feature that conflicts with these three priorities should be reconsidered.

---

# 5. User Build Decisions That Remain Governing

The private catalog CMS should support:

- Vercel-hosted application
- Separate internal login
- No MFA requirement for the initial office workflow
- Approximately five office logins initially
- Roles:
  - Admin
  - Editor
  - View-only later
- CMS hidden from public navigation
- One wine per structured record
- One producer per reusable producer record
- Reusable taxonomy for locations, grapes, critics, supervision, designations, etc.
- Existing catalog imported into the new system
- Existing wording preserved during migration and questionable items flagged
- Conflicting facts flagged rather than silently overwritten
- Source/provenance available for factual fields
- Last verified date
- Review/verification system
- Statuses:
  - Draft
  - Needs Review
  - Approved
  - Published
  - Discontinued
- Admin and Editor may approve
- Missing optional data does not prevent a wine from being included if a user intentionally includes it
- Duplicate previous vintage workflow
- Side-by-side prior-vintage comparison
- Automatic normalization of spelling/formatting
- Original bottle image retained
- Bottle shape awareness
- Manual bottle size/position override
- Low-resolution warning
- Permanent approved map per appellation/subregion/region/country
- Appellation-first map hierarchy
- France and Italy map library first
- One canonical detailed wine-sheet template
- Multiple catalog presentation modes
- Live preview
- Different catalog subsets
- Print / Email / Web PDF presets
- Print output should support bleed/crop needs
- Every generated catalog version saved immutably
- Long-term data model reusable across website, sell sheets, restaurant documents, QR pages, and future catalogs

---

# 6. What the Current Repository Gets Right

This is important: the next developer should **not rebuild the entire system from scratch**.

The repository now contains many of the correct subsystems.

## 6.1 AI is now genuinely present

Unlike the earlier prototype, the current repo includes:

- `cms/lib/ai.ts`
- `cms/lib/ai-actions.ts`
- `cms/components/AIFieldButton.tsx`
- `cms/components/AIProposalReviewer.tsx`
- `cms/components/AIProposalsPanel.tsx`
- `cms/components/FillEverythingButton.tsx`

The AI layer is designed around proposals and acceptance rather than blind overwrites. This is directionally correct.

## 6.2 Dropbox is now implemented

The current repo includes:

- `cms/lib/dropbox.ts`
- `cms/components/DropboxBrowser.tsx`

This is a real improvement over the previous build.

## 6.3 Catalog infrastructure exists

The repo now includes:

- Catalog pages
- Catalog item/section reorder components
- Catalog sharing
- Clone catalog
- Catalog PDF HTML renderer
- Detailed, lineup/compact, and trade renderers

Files include:

- `cms/lib/sheet/catalog-html.tsx`
- `cms/lib/sheet/SingleWineSheet.tsx`
- `cms/lib/sheet/LineupPage.tsx`
- `cms/lib/sheet/TradePage.tsx`
- `cms/components/CatalogItemsReorder.tsx`
- `cms/components/CatalogSectionsReorder.tsx`
- `cms/components/CloneCatalogButton.tsx`

This is valuable. The next phase should refine and simplify these flows rather than discarding them.

## 6.4 Asset management exists

The repo contains:

- upload
- replace
- alt text
- asset grid
- bottle image panel
- backfill tools

Again: this is useful foundation.

## 6.5 Map management exists

The repo now contains:

- `cms/lib/maps/*`
- map uploader
- map version actions
- seed maps panel
- map storage patterns

The problem is no longer that maps are completely absent.

The problem is that the **default rendered visual language is wrong**.

---

# 7. Primary Failure #1: The Current Single-Wine Sheet Still Misses the Approved Design

The current `SingleWineSheet.tsx` is structurally cleaner than the first attempt, but the live screenshot shows that the actual page still does not feel designed.

Current structure:

- left column:
  - bottle
  - map
- right column:
  - vintage
  - producer
  - wine name
  - subtitle
  - scores
  - technical data
  - notes

That sounds reasonable in code, but the visual result is not strong enough.

## 7.1 Current visual problems seen in the screenshot

### Bottle is too small in perceived scale

The page shows a small bottle floating in a very large light area.

The bottle must act as the visual anchor.

It should not feel like a thumbnail inside a data export.

### Map is too small and weak

The current map looks like a small locator stamp.

It does not communicate terroir or appellation hierarchy.

### Title begins too low

The current page has too much unused space before the main wine identity.

The viewer should understand the wine immediately when the page appears.

### Data hierarchy is weak

The sheet currently makes technical details feel like fine print.

For a technical sheet, facts are not tertiary content.

### Large unused areas make the page look auto-generated

The page has awkward blank areas instead of intentional whitespace.

Intentional whitespace supports hierarchy.

Accidental whitespace makes the page look unfinished.

### Map and bottle are stacked rather than composed

The left-side bottle-over-map approach contributes to the “software layout” feeling.

The approved references feel more editorial because map, bottle, title, scores, and technical table are intentionally related.

---

# 8. New Governing Single-Wine Page Layout

The single-wine sheet should contain only seven primary visual elements:

1. Identity
2. Bottle
3. Map
4. Scores
5. Technical details
6. Tasting / winery text
7. Footer

Anything else must justify itself.

Do not add decorative elements just because space exists.

## 8.1 Identity hierarchy

The identity block should appear at the top of the page.

Order:

1. Vintage
2. Wine name
3. Producer
4. Appellation / designation
5. Region / country

Example:

```text
2020
CORTON VERGENNES
Aegerter
Grand Cru · Corton · Burgundy, France
```

**Wine name must be the largest identity text.**

Producer is secondary.

Do not allow the producer to dominate the title simply because the producer and wine name happen to overlap for some brands.

## 8.2 Bottle sizing target

The bottle should generally occupy approximately:

- 30–38% of page width
- 50–60% of usable page height

The bottle should feel premium and intentional.

Do not show a visible white source-image box behind the bottle when avoidable.

Bottle images should be cropped to useful content bounds.

## 8.3 Map sizing target

Map visual footprint should generally occupy approximately:

- 22–30% of page width

It must be large enough to read without zooming.

## 8.4 Scores

Maximum visible scores on the standard sheet: 4.

If there are fewer scores, the layout should contract gracefully.

Do not reserve four giant empty positions.

Each score should show:

- critic abbreviation/name
- score
- vintage label only when the score is from another vintage

Do not display previous-vintage scores as if they are current-vintage scores.

Default policy should be current-vintage scores only unless an explicit catalog setting allows prior-vintage references.

## 8.5 Technical details

Use a clean label/value table.

Recommended standard fields:

- Producer
- Region / Appellation
- Varietal / Blend
- Aging
- Size
- Mevushal
- Supervision

Optional flags such as Organic / Biodynamic / First Kosher Vintage should only appear when meaningful and true.

**Missing fields should disappear on export.**

The exported sheet should never say:

> not recorded

That language belongs in the editor only.

## 8.6 Tasting note

Target:

- approximately 45–70 words
- normal readable size
- never silently shrink below the agreed minimum

If copy is too long, flag it.

Options:

- Edit
- AI Shorten
- Reduce to 9pt
- Explicit 8pt override only if intentionally accepted

## 8.7 Winery note

Target:

- approximately 50–85 words
- concise and factual

Do not repeat the same winery history on every wine if a shorter producer summary can communicate the needed context.

## 8.8 Footer

Retain restrained footer:

**M & M IMPORTS**  
Fine Wines · Higher Conversations

No extra slogan is required on every technical sheet.

---

# 9. Single-Wine CSS Requirements

The current CSS in `cms/lib/sheet/sheet.css` is directionally close, but the next implementation should enforce the following rules.

## Typography

Normal body copy:

- target 9–10pt equivalent in final print

Technical table:

- target approximately 9pt

Wine name:

- large editorial display face
- responsive based on name length
- should not be forced small too aggressively

Producer:

- smaller eyebrow

Vintage:

- distinct but not competing with wine name

## Spacing

Do not simply allow flexbox content to flow downward and leave large blank regions.

Use a real page composition with named layout areas.

Recommended approach:

```text
HEADER / IDENTITY
---------------------------
BOTTLE      MAP + SCORES
BOTTLE      TECHNICAL DATA
---------------------------
TASTING     WINERY NOTE
---------------------------
FOOTER
```

This is more controlled than the current bottle/map vertical stack.

## No decorative clutter

Standard sheet should not include:

- estate photography
- random vineyard photography
- decorative pull quotes
- generic category slogans
- decorative wine glasses
- extra icon rows
- textures competing with data
- oversized badges

Those belong in Editorial mode.

---

# 10. Primary Failure #2: The Map System Is Factually Safer But Visually Too Weak

The current `region-map.tsx` uses a country silhouette and a locator point.

This is safer than inventing legal appellation boundaries, but it is not the approved presentation.

The screenshot confirms the result feels like:

> “France with a dot near Burgundy”

rather than:

> “Burgundy / Corton Grand Cru”

The map system needs two levels of geographic context.

---

# 11. Governing Map Architecture

Use this hierarchy:

```text
Appellation
↓
Subregion
↓
Region
↓
Country
```

The rendering engine should always choose the most specific approved map asset available.

Example:

```text
Corton Grand Cru
→ Côte de Beaune
→ Burgundy
→ France
```

Example:

```text
Saint-Émilion Grand Cru
→ Right Bank
→ Bordeaux
→ France
```

Example:

```text
Chianti Classico
→ Tuscany
→ Italy
```

---

# 12. Required Map Visual Grammar

Every wine map should follow the same visual language.

## Primary map

Show the region/subregion at a useful scale.

Highlight the appellation when a trusted boundary exists.

If a trusted boundary does not exist, use a precise locator point on the region map.

## Country inset

Small inset showing where the region is within the country.

## Labels

Use no more labels than needed.

Typical map:

- major city / reference city
- appellation
- region name

Avoid dense road-map behavior.

## Colors

- base geography: warm neutral
- highlighted appellation: M&M wine red
- city/reference dot: charcoal
- water: optional very pale neutral/blue-gray

## Never do

- giant generic country silhouette as the main map for a small appellation
- decorative fake boundaries
- Google-map visual styling
- excessive pins
- inconsistent map styles between wines

---

# 13. France Map Library: Priority Build List

The map system should be completed for France first alongside Italy.

Minimum France set:

## Bordeaux

- Bordeaux
- Pessac-Léognan
- Saint-Émilion
- Saint-Émilion Grand Cru
- Pomerol
- Margaux
- Saint-Estèphe
- Haut-Médoc
- Médoc

## Burgundy

- Burgundy / Bourgogne
- Côte de Nuits
- Côte de Beaune
- Corton
- Nuits-Saint-Georges
- Volnay
- Pommard
- Beaune
- Monthélie
- Puligny-Montrachet

## Other France

- Champagne
- Sancerre
- Loire
- Côtes de Provence
- Provence
- La Clape
- Languedoc

---

# 14. Italy Map Library: Priority Build List

Minimum Italy set:

## Tuscany

- Tuscany
- Chianti Classico
- Montalcino
- Maremma

## Piedmont

- Piedmont
- Barolo
- Terre Alfieri
- Barbera d'Asti
- Monferrato

## Campania

- Campania
- Fiano di Avellino
- Greco di Tufo
- Irpinia

## Additional

- Sicily
- Umbria
- Lazio
- Abruzzo

---

# 15. Representative Map Acceptance Test

Before map work is considered complete, visually test at least these wines:

1. Chianti Classico
2. Maremma
3. Barolo
4. Brunello di Montalcino
5. Saint-Émilion
6. Pessac-Léognan
7. Margaux
8. Pomerol
9. Champagne
10. Corton / Burgundy

Each must look like it belongs to the same map family while communicating the correct geographic level.

---

# 16. Primary Failure #3: Admin UX Is Still Designed for Technical Users

The current screenshot is functional for a user who understands software.

It is not yet appropriate for an office user who should be able to learn the system by looking at it.

The left rail currently shows concepts such as:

- Technical
- Grapes
- Scores
- Copy
- Bottle image
- Review items
- Sources

This mirrors the database/application architecture more than the user's mental model.

The workspace also exposes:

- percent zoom
- multiple scroll regions
- internal completion ratios
- technical statuses
- many cards

The user explicitly wants an **Apple-like experience** where a very inexperienced user can figure it out.

The next pass must prioritize this above density.

---

# 17. Governing UX Principle

> **Hide complexity until it is needed.**

The system may know a great deal.

The user should see only the next useful decision.

Bad:

> 5 of 7 complete

Better:

> **Almost ready**  
> Add a bottle image and review 2 suggestions.

Bad:

> Review items: 2 open

Better:

> **2 things to check**

Bad:

> Sources: 6 fields

Better:

Sources should live behind **View sources** unless the user is resolving a conflict.

---

# 18. Redesign the Wine Workspace

The current `WineWorkspace.tsx` uses a three-column layout with a left technical rail and a zoomable iframe preview.

The three-column idea can remain, but the experience should change substantially.

## 18.1 Sticky top header

Use:

```text
← Wines

Corton Vergennes
Aegerter · 2020

Almost ready

[ Preview ] [ Done ]
```

No ID button in the primary workflow.

No internal record metadata dominating the top.

Advanced metadata can live under `•••`.

## 18.2 Left rail

Replace the technical taxonomy with:

```text
Wine
Bottle
Details
Scores
Description
Review
```

Use plain language.

Recommended state language:

- complete
- needs attention
- optional

Do not make users interpret generic dot colors without explanatory language.

## 18.3 Progress

Replace:

> 5 of 7 complete

with contextual text:

- Ready
- Almost ready
- Needs a few details
- Needs review

Then list only the next one or two actions.

## 18.4 Editing

Stop hiding each form behind separate card-level Edit buttons.

Use a real edit mode.

When the user clicks **Edit wine**:

- fields become editable
- autosave is enabled
- the preview updates
- a persistent **Done** action exits edit mode

This is simpler than repeated Edit / Save / Close interactions.

## 18.5 Cards

Reduce the large-card-per-section visual pattern.

Use lighter section separation and whitespace.

Too many bordered cards make the CMS feel like enterprise administration software.

---

# 19. Simplify Field Language

Office-facing terminology should be human.

Use:

- **Details** instead of Technical
- **Description** instead of Copy
- **Bottle** instead of Bottle asset
- **Review** instead of Review items
- **Find image** instead of Asset lookup
- **Use this** instead of Accept proposal

Advanced terminology may remain in admin/debug interfaces.

---

# 20. Progressive Disclosure for Missing Optional Fields

The current center pane may display many rows such as:

- Aging — not recorded
- Bottle sizes — not recorded
- First kosher vintage — not recorded
- Organic — not recorded
- Biodynamic — not recorded

This creates visual noise.

Instead:

## Details

Show recorded fields normally.

Then:

> **3 optional details missing**

Clicking expands:

- Aging
- Bottle sizes
- Organic

This is much calmer.

---

# 21. Live Preview Must Be Rebuilt for Normal Humans

The current `WineWorkspace.tsx` exposes:

- `−`
- `52%`
- `+`
- `Hide`

This is computer-centric UI.

It should not be the default experience.

## Replace with

**Fit Page**

and optionally an overflow menu:

- Fit Page
- Actual Size
- 75%
- 100%

Default should always be **Fit Page**.

The user should not need to understand zoom percentages.

## Preview behavior

### Editing mode

- preview occupies roughly 35–40% of desktop width
- full page is scaled to fit
- avoid an inner scrollbar when possible
- clicking preview opens fullscreen

### Full preview mode

- editor disappears
- page becomes the main content
- obvious **Back to editing** action
- Previous Wine / Next Wine controls
- Export action

---

# 22. Avoid Nested Scroll Containers

The screenshot shows the preview as a page inside a scrollable iframe inside a scrollable admin page.

This is visually and cognitively confusing.

The normal editing preview should scale the entire Letter page to the available preview viewport.

No inner page scroll should be needed in the default state.

---

# 23. Consider Light Mode as the Default Office Theme

The current dark admin UI makes the product feel technical and makes the ivory preview look like a document embedded inside engineering software.

Recommended default office theme:

- App background: `#F6F5F2`
- Panels: white / warm white
- Main text: near-black
- Secondary: warm gray
- Accent: M&M wine red
- Borders: very light warm gray

Dark mode can remain available as an optional user preference.

The default should prioritize approachability.

---

# 24. Simplify Main Navigation

Current `Nav.tsx` exposes many technical areas at the same level:

- Dashboard
- Wines
- Catalogs
- Producers
- Assets
- Dropbox
- Data
- Maps
- Theme
- Review queue
- Users

This is too much for ordinary office users.

## Recommended everyday navigation

- Home
- Wines
- Catalogs
- Images
- Review

## Admin / Settings

Place under Settings or Admin:

- Producers
- Dropbox connection
- Data import
- Maps
- Theme
- Users
- System settings

The existence of a subsystem does not require it to be a top-level menu item.

---

# 25. AI: Keep the Capability, Hide the Technicality

The AI integration in the repo is now real and should be preserved.

But ordinary users should not think in terms of “Claude actions.”

They should see task language.

## For tasting note

- Improve
- Shorten
- Check

## For winery description

- Improve
- Shorten

## For missing factual field

> Aging information is missing.

**Find it**

Then:

> I found: **18 months in French oak**  
> Source: Producer technical sheet

**Use this**  
**Ignore**

The model name should not be part of the ordinary interface.

Claude is infrastructure, not the product.

---

# 26. AI Safety / Accuracy Behavior

Maintain two conceptual AI modes.

## Writing assistance

AI may rewrite:

- tasting note
- winery description
- food pairing
- short description

## Fact assistance

AI may only propose factual information when it can attach a source.

Examples:

- aging
- blend
- vintage
- supervision
- appellation
- designation
- bottle size

Factual suggestions should require explicit user acceptance.

Never silently write facts into approved records.

---

# 27. Dropbox: Keep Integration but Remove It From the User's Mental Model

The Dropbox integration is useful.

But most office users should not have to visit a dedicated Dropbox subsystem to add a bottle.

On a wine record:

> **Add bottle image**

should open:

- Current Library
- Website Images
- Dropbox
- Upload

The source can be tracked in metadata.

The user only needs to find the right image.

---

# 28. Bottle Image Workflow

Approved workflow:

1. preserve original
2. detect useful crop bounds
3. crop excess whitespace
4. straighten if needed
5. identify bottle family when useful
6. normalize apparent height
7. check print resolution
8. create web derivative
9. create print derivative
10. allow manual override

Do **not** blindly remove white backgrounds.

Optional segmentation/background removal may exist behind a preview/confirm step.

---

# 29. Catalog Builder: Make the Existing Capability Much Simpler

The repo already has meaningful catalog infrastructure.

The next pass should focus on the user-facing sequence.

## Step 1 — Choose wines

Checkbox wine list.

Once selected:

> **36 wines selected**

**Continue**

## Step 2 — Choose presentation

Large simple cards:

### Detailed
One wine per page.

### Editorial
More visual storytelling.

### Trade
More wines per page.

### Portfolio
Quick overview.

### Hybrid
Portfolio overview + detailed sheets.

## Step 3 — Organize

Group/order by:

- country
- region
- producer
- category
- manual drag

Allow optional:

- cover
- intro
- divider
- producer page
- contact page

## Step 4 — Preview

Thumbnail strip.

## Step 5 — Export

- Print PDF
- Email PDF
- Web PDF

Do not expose render-engine terminology.

---

# 30. Wine Selection UX

The wine library should make catalog creation obvious.

Each row/card:

- checkbox
- bottle thumbnail
- wine
- producer
- vintage
- location
- status
- image state
- map state
- review state

Once any wine is selected, show a sticky bar:

> **4 selected**

**Create catalog**  
**Export**  
`•••`

Do not show twelve bulk actions at once.

---

# 31. Standard Export Types

The following should be treated as first-class products.

## Detailed Wine Sheet

- 1 wine per page
- approved universal data sheet

## Editorial

- typically 2–4 wines per page
- room for story / producer / regional visual content

## Trade

- typically 4–8 wines per page
- quick buyer/sommelier reference

## Portfolio

- multiple bottles
- visual overview
- short facts only

## Hybrid

Recommended master catalog structure:

1. Cover
2. M&M intro
3. Contents
4. Regional index
5. Portfolio overview
6. Section divider
7. Detailed sheets
8. Producer index
9. Contact/back cover

---

# 32. PDF Presets

Maintain three output presets:

## Print

- highest resolution
- embedded/bundled fonts
- print-safe assets
- bleed/crop support if needed
- no dependency on temporary external image URLs

## Email

- smaller file size
- visually faithful
- reduced image density where safe

## Web

- most compressed
- optimized for browser download/viewing

The presets must produce materially different assets/settings, not just different filenames.

---

# 33. Preflight Before Export

A professional catalog build needs a preflight screen.

Example:

> 72 wines selected  
> 68 bottle images ready  
> 4 low-resolution warnings  
> 2 maps need approval  
> 3 copy overflow warnings  
> 0 fatal errors

Actions:

**Resolve issues**  
**Generate anyway**

The user explicitly allows incomplete records to be included when desired.

Therefore warnings should not automatically become hard blocks unless rendering is impossible.

---

# 34. Preflight Severity

## Warning

- no critic score
- no pairing
- stale verification
- low-res bottle
- missing optional data

## Fatal

- missing record
- corrupt asset
- render failure
- impossible layout overflow

---

# 35. Source / Provenance UX

Keep the underlying provenance architecture.

Do not make it part of the primary editing flow unless needed.

When a conflict exists, show human language:

> **Two sources disagree about the blend.**

Source A: 80% Merlot / 20% Cabernet Franc  
Source B: 85% Merlot / 15% Cabernet Franc

**Use A**  
**Use B**  
**Leave unresolved**

That is much more understandable than exposing provenance records directly.

---

# 36. Review UX

Replace generic queue concepts with tasks.

Example:

## 2 things to check

### Bottle image is missing
**Add image**

### No current-vintage scores
**Add scores**  
**Ignore**

Review should feel like a to-do list, not an error console.

---

# 37. Status Language

Backend statuses may remain unchanged.

Office-facing language can be friendlier:

| Backend | Office UI |
|---|---|
| Draft | In progress |
| Needs Review | Ready to check |
| Approved | Ready |
| Published | Published |
| Discontinued | Discontinued |

---

# 38. Accessibility and Readability

Minimum requirements:

- all primary actions keyboard accessible
- visible focus states
- labels attached to all inputs
- no reliance on color alone for status
- large enough click/tap targets
- body text comfortable at typical laptop scaling
- no important information only available via hover
- preview controls understandable without icons alone

---

# 39. Mobile / Narrow-Screen Admin Behavior

The CMS is primarily desktop-oriented, but narrow screens should degrade cleanly.

Recommended:

- hide live preview by default on narrow screens
- editing becomes one column
- left rail becomes a compact section picker
- Preview opens fullscreen
- sticky primary action remains visible

Do not attempt to show the three-column desktop workspace at phone width.

---

# 40. Exact Files That Need Major UX/Design Work

The next developer should begin with these files.

## `cms/components/WineWorkspace.tsx`

Required changes:

- replace percentage zoom as primary control
- implement Fit Page
- simplify left rail labels
- contextual completion language
- fullscreen preview mode
- eliminate nested-scroll feeling
- simplify preview hide/show behavior

## `cms/app/(admin)/wines/[id]/page.tsx`

Required changes:

- simplify page header
- reduce technical metadata in primary header
- simplify completeness logic presentation
- reduce card clutter
- hide optional missing fields behind progressive disclosure
- sources become advanced/secondary
- humanize review language
- consolidate export actions

## `cms/components/WineEditSections.tsx`

Required changes:

- move toward edit mode/autosave rather than repeated panel-level edit/save interactions
- simplify labels
- make AI actions inline and task-based

## `cms/app/globals.css`

Required changes:

- lighter default UI option
- softer panel treatment
- less enterprise-card density
- clearer primary actions
- preview viewport redesign
- improved typography hierarchy

## `cms/lib/sheet/SingleWineSheet.tsx`

Required changes:

- use page-level named composition rather than bottle+map vertical stack
- move map into main composition
- strengthen identity at top
- improve score contraction when fewer than 4
- enforce clean export field omission
- balance tasting/winery text

## `cms/lib/sheet/sheet.css`

Required changes:

- layout redesign matching approved templates
- larger perceived bottle
- larger/useful map
- stronger technical table readability
- normal text target 9pt+
- eliminate awkward vertical gaps
- deliberate whitespace rather than leftover space

## `cms/lib/sheet/region-map.tsx`

Required changes:

- main region/subregion view rather than country-only map
- country inset
- appellation-first labels
- approved boundary when available
- consistent fallback grammar

## `cms/lib/sheet/wine-map-locations.ts`

Required changes:

- expand hierarchy metadata, not just centroid list
- include region/subregion relationships
- map point records should know parent region
- improve aliases

## `cms/components/Nav.tsx`

Required changes:

- simplify normal office navigation
- move technical systems under Settings/Admin

---

# 41. Proposed Map Data Structure

The current centroid lookup is useful but too flat.

Recommended normalized shape:

```ts
{
  country: "France",
  region: "Burgundy",
  subregion: "Côte de Beaune",
  appellation: "Corton",
  label: "Corton Grand Cru",
  lon: 4.87,
  lat: 47.07,
  aliases: [...],
  parentMapKey: "burgundy-cote-de-beaune",
  approvedBoundaryAssetId: null
}
```

This allows the renderer to decide:

- what geographic extent to show
- what to label
- what to highlight
- what inset to use

---

# 42. Standard Wine Sheet Pseudostructure

```text
┌─────────────────────────────────────────────────┐
│ 2020                                            │
│ CORTON VERGENNES                                │
│ Aegerter                                        │
│ Grand Cru · Corton · Burgundy, France           │
│─────────────────────────────────────────────────│
│                                                 │
│  BOTTLE                  BURGUNDY               │
│                          Corton Grand Cru       │
│                          [ refined map ]        │
│                                                 │
│                          SCORES                 │
│                          JS 94 · V 93 · WA 92   │
│─────────────────────────────────────────────────│
│ TECHNICAL DETAILS                               │
│ Producer            Aegerter                    │
│ Appellation         Corton Grand Cru            │
│ Varietal            100% Pinot Noir             │
│ Mevushal            No                          │
│ Supervision         OU ...                      │
│─────────────────────────────────────────────────│
│ TASTING NOTE             WINERY NOTE            │
│ readable short copy      readable short copy    │
│─────────────────────────────────────────────────│
│                 M & M IMPORTS                   │
│          Fine Wines · Higher Conversations      │
└─────────────────────────────────────────────────┘
```

This is not a rigid wireframe, but it communicates the intended hierarchy.

---

# 43. Hard Single-Wine Page Rules

A wine sheet is not acceptable unless:

- wine name is immediately visible
- bottle is immediately visible
- map is understandable without zooming
- technical data is readable
- no normal text is silently reduced below 9pt
- no accidental giant blank area dominates the page
- missing export fields disappear cleanly
- there are no unnecessary decorative modules
- the sheet looks intentional with 0, 1, 2, 3, or 4 critic scores
- long wine names still look elegant
- bottle shape differences do not break layout
- long supervision names do not destroy the table

---

# 44. Office UX Acceptance Tests

Before the next build is accepted, give the application to someone unfamiliar with the CMS.

Without instruction, ask them to perform these tasks.

## Test 1

> Change the tasting note.

Pass condition:

They find it immediately.

## Test 2

> Add or change the bottle image.

Pass condition:

They find the image workflow without navigating to a technical asset-management screen.

## Test 3

> Add a score.

Pass condition:

They understand where scores live.

## Test 4

> Make a PDF containing these five wines.

Pass condition:

They select wines and reach export without explanation.

## Test 5

> Make the same wines into a Trade catalog.

Pass condition:

They understand the presentation choice.

## Test 6

> Find out why this wine is not ready.

Pass condition:

The interface tells them in plain English.

If the tester needs verbal instruction, the workflow should be redesigned.

---

# 45. Representative Rendering Regression Set

Test every major renderer using a diverse set of wines.

Recommended:

- Aegerter Corton Vergennes
- Domaine de Montille Burgundy wine
- Château Smith Haut Lafitte
- Saint-Émilion wine
- Pomerol wine
- Pessac-Léognan wine
- Vallepicciola Chianti Classico
- Rocca di Frassinello Maremma
- Negretti Barolo
- Feudi San Gregorio Campania
- Champagne bottle
- Rosé bottle
- White Burgundy bottle

This set catches:

- narrow Burgundy bottles
- Bordeaux bottles
- Champagne bottles
- long/short labels
- different country/region maps
- long supervision names
- wines with/without scores

---

# 46. P0 — Must Fix Before Calling the Product Ready

1. Rebuild standard single-wine page to match approved templates.
2. Rebuild map visual system around appellation/region hierarchy.
3. Redesign wine workspace for plain-language, low-friction editing.
4. Replace zoom percentage with Fit Page default.
5. Eliminate nested preview scrolling in normal edit mode.
6. Simplify normal navigation.
7. Progressive disclosure for optional missing data.
8. Inline/simple AI actions.
9. Make bottle-image workflow accessible directly from wine editing.
10. Validate Detailed / Editorial / Trade / Portfolio selection flow with a nontechnical user.
11. Confirm Print / Email / Web outputs are actually distinct.
12. Run export preflight.
13. Ensure catalog version export remains reproducible.

---

# 47. P1 — High Value Immediately After P0

1. Complete France approved map library.
2. Complete Italy approved map library.
3. Improve producer editing UX.
4. Improve source conflict resolution UX.
5. Improve previous-vintage comparison.
6. Add stronger copy overflow handling.
7. Add image quality status directly in wine workspace.
8. Add catalog thumbnail preview strip.
9. Add easier catalog grouping/reordering.
10. Improve light/default visual theme.

---

# 48. P2 — Later Expansion

1. View-only/customer presentation account type.
2. Public website powered from catalog records.
3. QR wine pages.
4. Restaurant-specific presentation builder.
5. Distributor-specific exports.
6. Additional country map libraries.
7. More sophisticated print-production/PDF-X workflow when required by printer.

---

# 49. What Not to Do

Do not solve the next pass by:

- adding more cards
- adding more buttons
- adding more top-level navigation
- shrinking fonts to fit
- making maps smaller to save space
- adding decorative photos to technical sheets
- exposing AI model names everywhere
- exposing source/provenance architecture to ordinary users
- adding more status colors without explanatory text
- creating separate data records for each export style
- rebuilding the backend simply because the frontend misses the design

---

# 50. Definition of Done

The next pass is acceptable only when all of the following are true.

## Single wine

- visually matches the approved clean references
- feels like a designed wine sheet, not generated HTML
- bottle is a strong anchor
- wine name hierarchy is correct
- map looks refined and useful
- technical details are easy to read
- page works across multiple bottle shapes and appellations

## Editing

- new office user can understand what to do without training
- editing does not require opening and closing many cards
- missing items are described in human language
- AI feels like contextual assistance
- preview is obvious and legible

## Catalog building

- wines can be selected intuitively
- user can choose Detailed / Editorial / Trade / Portfolio / Hybrid
- user can preview before export
- user can export Print / Email / Web
- export preflight explains issues

## Maps

- France and Italy have coherent approved map families
- appellation is visually primary where appropriate
- fallback is graceful when exact boundaries are unavailable

## Publishing

- catalog versions are immutable
- old exports remain reproducible
- source assets do not depend on temporary external links at render time

---

# 51. Final Direction to the Next Developer

Do not treat this as another incremental polish sprint.

The backend is now capable enough that the main problem is **product design and publishing UX**.

Preserve the data model, catalog architecture, AI proposal model, Dropbox connector, asset layer, and versioning work unless a specific bug requires change.

Focus the next pass on:

1. **single-wine visual composition**
2. **map quality**
3. **office-user simplicity**
4. **catalog-builder clarity**
5. **reliable export**

The product should feel less like an administrative database and more like a dedicated M&M Imports publishing application.

The simplest test is:

> Can a person who has never used the system open a wine, fix what is missing, understand the page, choose five wines, and produce the correct PDF without somebody standing next to them?

If the answer is no, it is not ready.

---

# 52. Implementation Order Recommended

## Phase A — Lock the visual target

1. Use the included Template 01 and Template 06 reference images.
2. Rebuild one detailed sheet until Aegerter Corton Vergennes matches the intended hierarchy.
3. Test that exact layout on 10–12 representative wines.
4. Do not move forward until the universal sheet is stable.

## Phase B — Lock maps

1. Build France regional/subregional hierarchy.
2. Build Italy regional/subregional hierarchy.
3. Generate/approve core appellation assets.
4. Test representative set.

## Phase C — Simplify editor

1. Rewrite workspace navigation.
2. Add edit mode/autosave.
3. Fit Page preview.
4. Progressive disclosure.
5. Human-language review.

## Phase D — Catalog UX

1. selection
2. layout choice
3. order/group
4. preview
5. preflight
6. export

## Phase E — Nontechnical user test

Run the six office UX acceptance tests from this document.

Only after those pass should the product be treated as ready for routine catalog production.

---

# Appendix A — Current Repository Areas to Preserve

These areas are now useful enough to keep and improve:

- database migrations and normalized records
- field provenance model
- audit model
- AI proposal/acceptance pattern
- Dropbox wrapper
- asset storage and asset associations
- catalog records / sections / items
- catalog version model
- catalog render modes
- PDF rendering pipeline concept
- selection provider / bulk selection foundation
- catalog sharing foundation
- review flags and QC scan foundation

The new work is primarily a **front-end workflow and renderer quality correction**, not a data-platform rewrite.

---

# Appendix B — Included Design References

Relative paths:

```text
cms/docs/current-ui-reference-2026-10-08.png
cms/docs/approved-reference-template-01.png
cms/docs/approved-reference-template-06.png
```

The current screenshot should be treated as the **before** reference.

The approved templates should be treated as the visual direction.

Template 06 is the stronger foundation for simplicity.

Template 01 provides useful bottle scale, title hierarchy, scores, data treatment, and footer refinement.

The final template should combine the strongest parts of both without reintroducing the visual clutter of the earlier concepts.
