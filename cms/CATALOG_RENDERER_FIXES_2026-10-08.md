# Catalog Renderer / Wine Map Correction — 2026-10-08

This pass corrects the two areas that had drifted furthest from the approved M&M catalog direction: the standard single-wine sheet and the wine maps.

## Governing design direction

The standard wine page is a **data sheet**, not a marketing poster. It should be premium and attractive, but calm enough that the reader immediately understands what to look at.

The standard sheet therefore uses:

- warm ivory paper
- one large normalized bottle image as the primary visual
- producer as a small eyebrow, with the **wine name as the dominant title**
- vintage, appellation/designation and region/country in a controlled hierarchy
- up to four restrained critic-score medallions
- a clean specification-style technical table
- concise tasting note
- concise winery note
- one small refined wine-location map
- consistent M&M Imports footer

The standard sheet intentionally does **not** use vineyard photos, lifestyle images, decorative rocks/fabrics, oversized pull quotes, multiple taglines, or other editorial imagery. Those elements belong only in optional editorial layouts.

## Single-wine sheet changes

- Rebuilt `SingleWineSheet.tsx` around a stable two-column layout.
- Bottle now anchors the left side instead of competing with title/map blocks.
- Main content is a single readable right-hand flow.
- Corrected title hierarchy: producer is secondary; wine name is primary.
- Added title-size classes so long Burgundy/Bordeaux names do not destroy the layout.
- Scores changed to small outlined medallions instead of oversized visual blocks.
- Technical information is now a ruled data table.
- Removed the empty “awaiting scores” block from wines without scores.
- Map moved to the visual column so it supports the bottle rather than competing with the title.
- Kept optional trade pricing support without changing the standard page hierarchy.
- Export template version advanced to `wine-sheet-v2`.

## Wine-map changes

The old fallback system used chunky hand-drawn country/region blobs and often highlighted only a broad region such as Tuscany or Bordeaux. That was not precise enough.

The replacement system uses:

1. accurate Natural Earth country silhouettes for the core catalog countries
2. appellation/region centroid locator points for the actual wine location
3. a consistent M&M locator-map style on every sheet
4. appellation-first resolution before subregion, region or country
5. optional approved appellation GeoJSON as a small inset when one exists

The standard sheet no longer pretends that an approximate hand-drawn blob is an official appellation boundary.

### First-pass locator coverage

France includes, among others:

- Bordeaux
- Margaux
- Saint-Estèphe
- Pessac-Léognan
- Saint-Émilion
- Pomerol
- Haut-Médoc / Médoc
- Champagne
- Burgundy / Bourgogne
- Corton
- Nuits-Saint-Georges
- Volnay
- Puligny-Montrachet
- Monthélie
- Pommard
- Beaune
- Sancerre
- Côtes de Provence
- La Clape / Languedoc

Italy includes, among others:

- Tuscany
- Chianti Classico
- Montalcino (including Brunello/Rosso name inference)
- Maremma Toscana
- Piedmont
- Barolo
- Terre Alfieri
- Barbera d'Asti
- Monferrato
- Campania
- Fiano di Avellino
- Greco di Tufo
- Irpinia Aglianico
- Sicily / Sicilia
- Lazio
- Umbria
- Abruzzo

Germany, Hungary, the United States and Israel also have clean locator fallbacks for the locations currently represented in the catalog data.

## Multi-wine page cleanup

The lineup and trade views were visually pulled back to the same system:

- lighter score treatment
- less drop shadow
- fewer dark blocks
- quieter typography
- cleaner card/grid rules
- map styling consistent with the single-wine sheet
- removal of unnecessary marketing-style trade header copy

## Map-seeding behavior

Bulk map seeding now prioritizes **appellations first**, followed by subregions, regions and countries. This matches the intended publishing hierarchy.

## Files added

- `lib/sheet/country-outlines.ts`
- `lib/sheet/wine-map-locations.ts`

## Files materially revised

- `lib/sheet/SingleWineSheet.tsx`
- `lib/sheet/region-map.tsx`
- `lib/sheet/sheet.css`
- `lib/sheet/data.ts`
- `lib/sheet/TradePage.tsx`
- `lib/sheet/LineupPage.tsx`
- `lib/actions.ts`
- `app/api/catalogs/[id]/export/route.ts`

## Validation note

The modified TypeScript/TSX files were syntax-checked with the available TypeScript compiler. A full Next production build could not be completed in this environment because the repository ZIP does not include `node_modules` and dependency installation was not available within the execution window. No database schema was removed or replaced in this pass.
