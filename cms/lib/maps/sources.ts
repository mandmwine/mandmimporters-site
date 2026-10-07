// Public map-data sources used to seed draft map_assets for locations.
//
// Primary source: OpenStreetMap Nominatim's `polygon_geojson` endpoint. It's
// free, public, and returns a GeoJSON polygon for named places — ideal for
// wine appellations which usually have an official administrative boundary
// recorded in OSM. Country lookups also go here, because Nominatim's country
// polygons are a lot smaller than Natural Earth's and ship with a bounding
// box we can show the user.
//
// Nominatim's usage policy caps us at ~1 req/sec and requires a descriptive
// User-Agent, both honored here. The caller is responsible for rate-limiting
// across many lookups (we add a `sleep` helper for that).
import "server-only";
import type { GeoCollection, GeoFeature } from "./render";

const UA = "mandmimporters-cms/1.0 (admin seed script; rafael@mandmimporters.com)";

export type SeedResult =
  | {
      ok: true;
      feature: GeoFeature;
      collection: GeoCollection;
      source: string;
      source_url: string;
      display_name: string;
    }
  | {
      ok: false;
      reason: string;
    };

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type NominatimResult = {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  address?: Record<string, string>;
  geojson?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
};

export async function fetchFromNominatim(opts: {
  query: string;
  type: "country" | "region" | "subregion" | "appellation";
  countryHint?: string;
}): Promise<SeedResult> {
  const params = new URLSearchParams({
    q: opts.query,
    format: "json",
    polygon_geojson: "1",
    limit: "3",
    addressdetails: "1",
  });
  if (opts.countryHint) params.set("countrycodes", countryToIso(opts.countryHint) ?? "");
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // Cache for 24h — the same appellation shouldn't change in a day.
      next: { revalidate: 86400 },
    });
  } catch (err) {
    return { ok: false, reason: `Nominatim unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, reason: `Nominatim HTTP ${res.status}` };
  }
  const results = (await res.json()) as NominatimResult[];
  if (!results.length) {
    return { ok: false, reason: `No match on OpenStreetMap for "${opts.query}"` };
  }
  // Prefer a result that is a polygon of the right administrative class.
  const picked =
    results.find((r) => r.geojson && (r.class === "boundary" || r.type === "administrative")) ??
    results.find((r) => r.geojson) ??
    null;
  if (!picked || !picked.geojson) {
    return { ok: false, reason: `OSM returned no polygon for "${opts.query}"` };
  }
  // Build a one-feature FeatureCollection the sheet renderer understands.
  const feature: GeoFeature = {
    type: "Feature",
    properties: {
      name: opts.query,
      kind: opts.type,
      osm_type: picked.osm_type,
      osm_id: picked.osm_id,
      source: "openstreetmap",
    },
    geometry: {
      type: picked.geojson.type,
      // Nominatim's shape matches our Feature exactly for Polygon / MultiPolygon.
      coordinates: picked.geojson.coordinates as number[][][] | number[][][][],
    },
  };
  const collection: GeoCollection = {
    type: "FeatureCollection",
    features: [feature],
  };
  const osmType = picked.osm_type === "relation" ? "R" :
                  picked.osm_type === "way" ? "W" :
                  picked.osm_type === "node" ? "N" : "R";
  return {
    ok: true,
    feature,
    collection,
    source: "openstreetmap",
    source_url: `https://www.openstreetmap.org/${picked.osm_type}/${picked.osm_id}`,
    display_name: picked.display_name,
  };
}

// A tiny lookup table for countries we actually ship from. Keeps us from
// having to pull a 23MB dataset at seed time just to filter by country.
const COUNTRY_TO_ISO: Record<string, string> = {
  france: "fr",
  italy: "it",
  spain: "es",
  israel: "il",
  usa: "us",
  "united states": "us",
  "united states of america": "us",
  argentina: "ar",
  chile: "cl",
  portugal: "pt",
  germany: "de",
  australia: "au",
  "new zealand": "nz",
  "south africa": "za",
  austria: "at",
  hungary: "hu",
  georgia: "ge",
  lebanon: "lb",
  canada: "ca",
  greece: "gr",
  slovenia: "si",
  croatia: "hr",
};

function countryToIso(name: string): string | null {
  return COUNTRY_TO_ISO[name.toLowerCase()] ?? null;
}

// Compose the Nominatim query string that gives us the best chance of a hit.
// Appellations like "Chianti Classico" are often found on their own; obscure
// ones need the country tacked on.
export function composeQuery(parts: {
  name: string;
  type: "country" | "region" | "subregion" | "appellation";
  countryName: string | null;
  regionName: string | null;
}): string {
  if (parts.type === "country") return parts.name;
  const bits = [parts.name];
  if (parts.type === "appellation" || parts.type === "subregion") {
    if (parts.regionName && parts.regionName !== parts.name) bits.push(parts.regionName);
  }
  if (parts.countryName && parts.countryName !== parts.name) bits.push(parts.countryName);
  return bits.join(", ");
}
