// Look up the approved map that best fits a wine's location chain.  We walk
// from the most specific location (appellation) up to its country, returning
// the first location that has an approved map_asset.  The caller then renders
// the GeoJSON highlighting the wine's actual location by name.
import { one, query } from "@/lib/db";
import type { GeoCollection } from "./render";

export type LocationChain = {
  country: string | null;
  region: string | null;
  subregion: string | null;
  appellation: string | null;
};

type MapRow = {
  id: string;
  location_id: string;
  location_name: string;
  location_type: "country" | "region" | "subregion" | "appellation";
  geojson: GeoCollection | null;
};

export async function loadApprovedMapForLocation(
  startLocationId: string | null,
): Promise<MapRow | null> {
  if (!startLocationId) return null;
  // Walk up: fetch the chain from the DB, then query map_assets for the first
  // location on the chain that has an approved map.
  const chain = await query<{ id: string; name: string; type: string; parent_id: string | null }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
       UNION ALL
       SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1
         FROM locations x JOIN up ON x.id = up.parent_id)
     SELECT id, name, type, parent_id FROM up ORDER BY depth`,
    [startLocationId],
  );
  if (chain.length === 0) return null;

  const ids = chain.map((c) => c.id);
  // The CASE expression orders rows by the chain's depth so the most specific
  // approved map wins.
  const picked = await one<MapRow>(
    `SELECT m.id, m.location_id, l.name AS location_name, l.type AS location_type, m.geojson
     FROM map_assets m
     JOIN locations l ON l.id = m.location_id
     WHERE m.status = 'approved' AND m.location_id = ANY($1::uuid[])
     ORDER BY array_position($1::uuid[], m.location_id)
     LIMIT 1`,
    [ids],
  );
  return picked ?? null;
}

export async function locationChainForMap(startLocationId: string | null): Promise<LocationChain> {
  const out: LocationChain = { country: null, region: null, subregion: null, appellation: null };
  if (!startLocationId) return out;
  const rows = await query<{ name: string; type: "country" | "region" | "subregion" | "appellation" }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
       UNION ALL
       SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1
         FROM locations x JOIN up ON x.id = up.parent_id)
     SELECT name, type FROM up`,
    [startLocationId],
  );
  for (const r of rows) {
    if (r.type in out) out[r.type] = r.name;
  }
  return out;
}
