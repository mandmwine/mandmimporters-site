// Region-scope locator map — Phase 22 (audit Phase B).
//
// What changed vs Phase 20:
//   Phase 20 rendered the whole country outline with a small locator pin at
//   the appellation. For big countries that reads as "France with a dot" or
//   "Italy with a dot" — the appellation itself was tiny, and Burgundy and
//   Bordeaux looked identical at that zoom.
//
//   Phase 22 renders the SAME country outline through a cropped SVG viewBox
//   zoomed to the region's bbox, with the appellation marked and labeled.
//   That matches Template 01 (Tuscany-only view with Chianti Classico
//   highlighted) and gives the sheet a true region-scope map at the small
//   corner size.
//
//   When a wine's region isn't in WINE_REGIONS yet, the renderer falls back
//   to the Phase 20 country+pin so no wine is left without a map.
import { renderMap, type GeoCollection, type GeoFeature } from "@/lib/maps/render";
import { COUNTRY_OUTLINES, type CountryOutline } from "./country-outlines";
import {
  findWineMapPoint,
  findWineRegion,
  type WineMapPoint,
  type WineRegion,
} from "./wine-map-locations";

type LocationFacts = {
  country: string | null;
  region: string | null;
  subregion: string | null;
  appellation: string | null;
};

export type GeoMap = {
  geojson: GeoCollection;
  location_name: string;
  location_type?: "country" | "region" | "subregion" | "appellation";
  highlight: string | null;
};

function titleCaseFallback(location: LocationFacts): string {
  return location.appellation ?? location.subregion ?? location.region ?? location.country ?? "Wine region";
}

function projectPoint(outline: CountryOutline, lon: number, lat: number): { x: number; y: number } {
  const [minLon, , , maxLat] = outline.bbox;
  const { kx, scale, offX, offY } = outline.projection;
  return {
    x: offX + (lon - minLon) * kx * scale,
    y: offY + (maxLat - lat) * scale,
  };
}

// Build an SVG viewBox string that crops the country's native SVG coordinate
// space to the region's bbox. Projects the bbox corners through the country's
// own projection so geography is preserved.
function regionViewBox(outline: CountryOutline, region: WineRegion, paddingSvg = 2): string {
  const [minLon, minLat, maxLon, maxLat] = region.bbox;
  const topLeft = projectPoint(outline, minLon, maxLat);
  const bottomRight = projectPoint(outline, maxLon, minLat);
  const x = topLeft.x - paddingSvg;
  const y = topLeft.y - paddingSvg;
  const w = bottomRight.x - topLeft.x + paddingSvg * 2;
  const h = bottomRight.y - topLeft.y + paddingSvg * 2;
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;
}

function approvedAppellationShape(geoMap: GeoMap | null | undefined) {
  if (!geoMap || geoMap.location_type !== "appellation") return null;
  const r = renderMap(geoMap.geojson, {
    width: 240,
    padding: 0.07,
    highlightName: geoMap.highlight ?? geoMap.location_name,
  });
  return r.svg ? r : null;
}

// Primary caption: appellation (italic, large) and region (small caps).
function MapCaption({
  region,
  country,
  appellation,
}: {
  region: string;
  country: string;
  appellation: string | null;
}) {
  return (
    <figcaption>
      <span className="sheet__map-caption-country">
        {region.toUpperCase()}
        {country && country.toLowerCase() !== region.toLowerCase() ? `, ${country.toUpperCase()}` : ""}
      </span>
      {appellation && <span className="sheet__map-caption-region">{appellation}</span>}
    </figcaption>
  );
}

export function renderRegionMap(
  location: LocationFacts,
  geoMap?: GeoMap | null,
  wineHint?: string | null,
) {
  const country = location.country ?? "";
  const outline = COUNTRY_OUTLINES[country];

  const target: WineMapPoint | null = findWineMapPoint(country, [
    location.appellation,
    location.subregion,
    location.region,
    wineHint,
  ]);
  const region: WineRegion | null = findWineRegion(
    country,
    [location.region, location.subregion, location.appellation, wineHint],
    target,
  );
  const label = location.appellation ?? location.subregion ?? target?.label ?? location.region ?? null;
  const fallbackLabel = titleCaseFallback(location);
  const localShape = approvedAppellationShape(geoMap);

  // Case 1 — no country outline at all. Minimal placeholder, Phase 20 shape.
  if (!outline) {
    return (
      <figure className="sheet__map sheet__map--placeholder">
        <div className="sheet__map-placeholder-mark" aria-hidden="true">●</div>
        <figcaption>
          <span className="sheet__map-caption-country">{country.toUpperCase()}</span>
          <span className="sheet__map-caption-region">{fallbackLabel}</span>
        </figcaption>
      </figure>
    );
  }

  const point = target ? projectPoint(outline, target.lon, target.lat) : null;

  // Case 2 — region in WINE_REGIONS: zoom to region bbox, show appellation.
  if (region) {
    const viewBox = regionViewBox(outline, region);
    return (
      <figure className="sheet__map sheet__map--region" aria-label={`${region.label}, ${country}`}>
        <div className="sheet__map-art sheet__map-art--region">
          <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg">
            <path
              d={outline.path}
              className="sheet__map-country"
              vectorEffect="non-scaling-stroke"
            />
            {point && (
              <g className="sheet__map-pin" transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}>
                <circle className="sheet__map-pin-halo" r="2.6" />
                <circle className="sheet__map-pin-dot" r="1.1" vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </svg>
          {localShape && (
            <div className="sheet__map-inset" aria-label={`${label} appellation outline`}>
              <svg
                viewBox={localShape.viewBox}
                xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{ __html: localShape.svg }}
              />
            </div>
          )}
        </div>
        <MapCaption region={region.label} country={country} appellation={location.appellation} />
      </figure>
    );
  }

  // Case 3 — no region: fall back to Phase 20 country+pin.
  return (
    <figure className="sheet__map sheet__map--locator" aria-label={`${fallbackLabel}, ${country}`}>
      <div className="sheet__map-art">
        <svg viewBox={outline.viewBox} xmlns="http://www.w3.org/2000/svg">
          <path d={outline.path} className="sheet__map-country" vectorEffect="non-scaling-stroke" />
          {point && (
            <g className="sheet__map-pin" transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}>
              <circle className="sheet__map-pin-halo" r="7.5" />
              <circle className="sheet__map-pin-dot" r="3.2" />
            </g>
          )}
        </svg>
      </div>
      <figcaption>
        <span className="sheet__map-caption-country">{country.toUpperCase()}</span>
        <span className="sheet__map-caption-region">{fallbackLabel}</span>
      </figcaption>
    </figure>
  );
}

export type { GeoFeature };
