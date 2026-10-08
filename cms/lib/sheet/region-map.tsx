// Refined catalog locator map.
//
// Design goal: a consistent, restrained, factual map across the whole book.
// The default sheet no longer invents chunky hand-drawn appellation polygons.
// Instead it renders an accurate Natural Earth country silhouette and places
// a precise locator point at the appellation / region centroid. When an
// approved GeoJSON exists, it can still be used for an appellation boundary,
// but the locator remains the visual language so every wine looks coherent.
import { renderMap, type GeoCollection, type GeoFeature } from "@/lib/maps/render";
import { COUNTRY_OUTLINES } from "./country-outlines";
import { findWineMapPoint } from "./wine-map-locations";

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

function projectPoint(country: string, lon: number, lat: number): { x: number; y: number } | null {
  const outline = COUNTRY_OUTLINES[country];
  if (!outline) return null;
  const [minLon, , , maxLat] = outline.bbox;
  const { kx, scale, offX, offY } = outline.projection;
  return {
    x: offX + (lon - minLon) * kx * scale,
    y: offY + (maxLat - lat) * scale,
  };
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

export function renderRegionMap(
  location: LocationFacts,
  geoMap?: GeoMap | null,
  wineHint?: string | null,
) {
  const country = location.country ?? "";
  const target = findWineMapPoint(country, [
    location.appellation,
    location.subregion,
    location.region,
    wineHint,
  ]);
  const label = target?.label ?? titleCaseFallback(location);
  const outline = COUNTRY_OUTLINES[country];
  const point = target ? projectPoint(country, target.lon, target.lat) : null;
  const localShape = approvedAppellationShape(geoMap);

  if (!outline) {
    return (
      <figure className="sheet__map sheet__map--placeholder">
        <div className="sheet__map-placeholder-mark" aria-hidden="true">●</div>
        <figcaption>
          <span className="sheet__map-caption-country">{country.toUpperCase()}</span>
          <span className="sheet__map-caption-region">{label}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="sheet__map sheet__map--locator">
      <div className="sheet__map-art">
        <svg viewBox={outline.viewBox} xmlns="http://www.w3.org/2000/svg" aria-label={`${label}, ${country}`}>
          <path d={outline.path} className="sheet__map-country" />
          {point && (
            <g className="sheet__map-pin" transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}>
              <circle className="sheet__map-pin-halo" r="7.5" />
              <circle className="sheet__map-pin-dot" r="3.2" />
            </g>
          )}
        </svg>
        {localShape && (
          <div className="sheet__map-inset" aria-label={`${label} appellation outline`}>
            <svg viewBox={localShape.viewBox} xmlns="http://www.w3.org/2000/svg" dangerouslySetInnerHTML={{ __html: localShape.svg }} />
          </div>
        )}
      </div>
      <figcaption>
        <span className="sheet__map-caption-country">{country.toUpperCase()}</span>
        <span className="sheet__map-caption-region">{label}</span>
        <span className="sheet__map-caption-type">{location.appellation ? "Appellation locator" : "Region locator"}</span>
      </figcaption>
    </figure>
  );
}

export type { GeoFeature };
