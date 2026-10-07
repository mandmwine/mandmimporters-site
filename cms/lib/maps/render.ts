// GeoJSON → SVG renderer for the sheet's region map.
//
// Each `map_asset` holds a GeoJSON FeatureCollection whose features cover the
// relevant country, region, subregion and appellations.  Each feature's
// properties include `name`, `kind` ("country" | "region" | "subregion" |
// "appellation") and optional `aliases`.
//
// We project with a simple equirectangular projection scaled so the geometry
// fits the viewBox, with a latitude correction so a Chianti Classico shape
// doesn't come out stretched east-west: lon-degrees are scaled by cos(centerLat)
// to approximate the real-world aspect ratio at that latitude.  Fine for the
// scale of a sheet's single-page map.
//
// This file is intentionally dependency-free so it runs anywhere.

export type GeoFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> & {
    name?: string;
    kind?: "country" | "region" | "subregion" | "appellation";
    aliases?: string[];
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    // Polygon: [ ring, ring, ... ] where ring = [ [lon, lat], ... ]
    // MultiPolygon: [ polygon, polygon, ... ]
    coordinates: number[][][] | number[][][][];
  };
};
export type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

type Projected = { x: number; y: number };

type Box = { minLon: number; maxLon: number; minLat: number; maxLat: number };

type RenderOptions = {
  width?: number;         // SVG viewBox width in design units
  padding?: number;       // 0..1 of the smaller dimension, kept inside the viewBox
  highlightName?: string | null;  // feature.properties.name to highlight
  highlightKind?: GeoFeature["properties"] extends infer _ ? ("appellation" | "subregion" | "region" | "country") : never;
};

type Rendered = {
  svg: string;        // the inner SVG markup (no outer <svg> wrapper — the sheet adds that)
  viewBox: string;    // viewBox value
  width: number;
  height: number;
  highlighted: string | null;
};

// ---------------------------------------------------------------- utilities

function iterRings(f: GeoFeature): number[][][] {
  if (f.geometry.type === "Polygon") {
    return f.geometry.coordinates as number[][][];
  }
  // MultiPolygon: flatten one level, each polygon is a list of rings.
  const flat: number[][][] = [];
  for (const poly of f.geometry.coordinates as number[][][][]) {
    for (const ring of poly) flat.push(ring);
  }
  return flat;
}

function bboxOf(features: GeoFeature[]): Box {
  let minLon = +Infinity, maxLon = -Infinity, minLat = +Infinity, maxLat = -Infinity;
  for (const f of features) {
    for (const ring of iterRings(f)) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function matchName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function hasName(f: GeoFeature, name: string | null | undefined): boolean {
  if (!name) return false;
  if (matchName(f.properties?.name, name)) return true;
  const aliases = f.properties?.aliases;
  if (Array.isArray(aliases)) {
    for (const a of aliases) if (matchName(a, name)) return true;
  }
  return false;
}

// ------------------------------------------------------------- public API

export function findHighlightFeature(
  features: GeoFeature[],
  chain: { appellation?: string | null; subregion?: string | null; region?: string | null; country?: string | null },
): GeoFeature | null {
  const order = [
    { name: chain.appellation, kind: "appellation" as const },
    { name: chain.subregion, kind: "subregion" as const },
    { name: chain.region, kind: "region" as const },
    { name: chain.country, kind: "country" as const },
  ];
  for (const step of order) {
    if (!step.name) continue;
    const match = features.find((f) =>
      hasName(f, step.name) && (!f.properties?.kind || f.properties.kind === step.kind),
    );
    if (match) return match;
    const anyMatch = features.find((f) => hasName(f, step.name));
    if (anyMatch) return anyMatch;
  }
  return null;
}

export function renderMap(
  geo: GeoCollection,
  opts: RenderOptions = {},
): Rendered {
  const width = opts.width ?? 320;
  const padding = Math.max(0, Math.min(0.3, opts.padding ?? 0.04));
  const features = geo.features ?? [];
  if (features.length === 0) {
    return { svg: "", viewBox: `0 0 ${width} ${width}`, width, height: width, highlighted: null };
  }

  const bb = bboxOf(features);
  const centerLat = (bb.minLat + bb.maxLat) / 2;
  const kx = Math.cos((centerLat * Math.PI) / 180) || 1;
  const lonSpan = (bb.maxLon - bb.minLon) * kx;
  const latSpan = bb.maxLat - bb.minLat;
  if (lonSpan <= 0 || latSpan <= 0) {
    return { svg: "", viewBox: `0 0 ${width} ${width}`, width, height: width, highlighted: null };
  }

  // Fit the geometry into `width` × computed height, with uniform scale so
  // the shape isn't distorted.
  const availW = width * (1 - padding * 2);
  const scale = availW / lonSpan;
  const height = Math.round(latSpan * scale + width * padding * 2);
  const offX = width * padding;
  const offY = width * padding;

  function project(lon: number, lat: number): Projected {
    // Equirectangular with cosine latitude correction. Y flipped so north is up.
    const x = offX + (lon - bb.minLon) * kx * scale;
    const y = offY + (bb.maxLat - lat) * scale;
    return { x, y };
  }

  function featurePath(f: GeoFeature): string {
    const parts: string[] = [];
    const rings = iterRings(f);
    for (const ring of rings) {
      if (ring.length === 0) continue;
      const [lon0, lat0] = ring[0];
      const p0 = project(lon0, lat0);
      parts.push(`M${p0.x.toFixed(1)},${p0.y.toFixed(1)}`);
      for (let i = 1; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const p = project(lon, lat);
        parts.push(`L${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      parts.push("Z");
    }
    return parts.join(" ");
  }

  // Decide which feature (if any) is the highlight.
  let highlight: GeoFeature | null = null;
  if (opts.highlightName) {
    highlight = features.find((f) => hasName(f, opts.highlightName)) ?? null;
  }

  // Draw order: outlines first (so highlight sits on top), label last.
  const outlineFeatures = features.filter((f) => f !== highlight);
  const highlightedName =
    (highlight?.properties?.name as string | undefined) ?? null;

  const outlines = outlineFeatures
    .map((f) => {
      const kind = (f.properties?.kind as string) ?? "region";
      return `<path d="${featurePath(f)}" class="map-feature map-feature--${kind}" />`;
    })
    .join("");

  const highlightSvg = highlight
    ? `<path d="${featurePath(highlight)}" class="map-feature map-feature--highlight" />`
    : "";

  return {
    svg: outlines + highlightSvg,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    highlighted: highlightedName,
  };
}
