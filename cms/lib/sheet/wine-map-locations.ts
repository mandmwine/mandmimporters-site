// Wine map data — appellation points and the region bboxes they belong to.
//
// Phase 22 (audit Phase B) adds a region hierarchy on top of the Phase 20
// flat point list. Every appellation point now knows which region it sits in,
// and each region carries a lon/lat bbox the renderer uses to crop the country
// outline into a true region-scope map (Template 01 reference: a Tuscany-only
// view with the appellation marked, not a country-sized view with a tiny dot).
//
// Priority regions per the directive § 13-14: France Bordeaux / Burgundy /
// Champagne / Loire / Provence / Languedoc; Italy Tuscany / Piedmont /
// Campania / Sicily / Lazio / Umbria / Abruzzo / Veneto / Marche; plus
// Germany, Hungary and California first-pass regions.

export type WineMapPoint = {
  label: string;
  lon: number;
  lat: number;
  aliases?: string[];
  // region_key points at WINE_REGIONS; a region's own entry has region_key === its own key.
  region_key?: string;
};

export type WineRegion = {
  key: string;
  country: string;
  label: string;
  // [minLon, minLat, maxLon, maxLat] — generous bbox for the region.
  bbox: [number, number, number, number];
  // Optional center of mass used to place the region-highlight dot on a
  // country inset (not drawn yet, but kept for future use).
  centroid: { lon: number; lat: number };
};

// ---------------------------------------------------------------------------
// Region bboxes — hand-tuned, deliberately generous so the region fills the
// map area without the appellation point touching the edge.
// ---------------------------------------------------------------------------

export const WINE_REGIONS: Record<string, WineRegion> = {
  // France -----------------------------------------------------------------
  bordeaux: {
    key: "bordeaux", country: "France", label: "Bordeaux",
    bbox: [-1.40, 44.25, 0.35, 45.55],
    centroid: { lon: -0.55, lat: 44.90 },
  },
  burgundy: {
    key: "burgundy", country: "France", label: "Burgundy",
    bbox: [3.40, 46.20, 5.70, 48.10],
    centroid: { lon: 4.70, lat: 47.20 },
  },
  champagne: {
    key: "champagne", country: "France", label: "Champagne",
    bbox: [3.20, 48.30, 5.10, 49.70],
    centroid: { lon: 4.00, lat: 49.00 },
  },
  loire: {
    key: "loire", country: "France", label: "Loire Valley",
    bbox: [-0.90, 46.50, 3.60, 47.90],
    centroid: { lon: 1.60, lat: 47.30 },
  },
  provence: {
    key: "provence", country: "France", label: "Provence",
    bbox: [4.80, 42.90, 7.60, 44.25],
    centroid: { lon: 6.00, lat: 43.60 },
  },
  languedoc: {
    key: "languedoc", country: "France", label: "Languedoc-Roussillon",
    bbox: [1.80, 42.40, 4.60, 44.25],
    centroid: { lon: 3.00, lat: 43.50 },
  },

  // Italy ------------------------------------------------------------------
  tuscany: {
    key: "tuscany", country: "Italy", label: "Tuscany",
    bbox: [9.80, 42.30, 12.25, 44.25],
    centroid: { lon: 11.10, lat: 43.30 },
  },
  piedmont: {
    key: "piedmont", country: "Italy", label: "Piedmont",
    bbox: [6.80, 44.00, 9.35, 46.50],
    centroid: { lon: 7.90, lat: 44.90 },
  },
  campania: {
    key: "campania", country: "Italy", label: "Campania",
    bbox: [13.80, 39.90, 15.95, 41.60],
    centroid: { lon: 14.80, lat: 40.80 },
  },
  sicily: {
    key: "sicily", country: "Italy", label: "Sicily",
    bbox: [11.50, 36.40, 15.80, 38.45],
    centroid: { lon: 14.00, lat: 37.60 },
  },
  lazio: {
    key: "lazio", country: "Italy", label: "Lazio",
    bbox: [11.30, 41.20, 14.10, 42.85],
    centroid: { lon: 12.60, lat: 41.90 },
  },
  umbria: {
    key: "umbria", country: "Italy", label: "Umbria",
    bbox: [11.85, 42.20, 13.35, 43.65],
    centroid: { lon: 12.50, lat: 42.90 },
  },
  abruzzo: {
    key: "abruzzo", country: "Italy", label: "Abruzzo",
    bbox: [13.00, 41.60, 14.95, 42.95],
    centroid: { lon: 13.90, lat: 42.30 },
  },
  veneto: {
    key: "veneto", country: "Italy", label: "Veneto",
    bbox: [10.50, 44.70, 13.30, 46.70],
    centroid: { lon: 11.80, lat: 45.60 },
  },
  marche: {
    key: "marche", country: "Italy", label: "Marche",
    bbox: [12.10, 42.60, 14.00, 43.95],
    centroid: { lon: 13.20, lat: 43.30 },
  },

  // Germany ---------------------------------------------------------------
  franken: {
    key: "franken", country: "Germany", label: "Franken",
    bbox: [8.95, 49.30, 11.35, 50.55],
    centroid: { lon: 10.10, lat: 49.80 },
  },
  mosel: {
    key: "mosel", country: "Germany", label: "Mosel",
    bbox: [6.30, 49.45, 7.35, 50.55],
    centroid: { lon: 6.90, lat: 49.90 },
  },

  // Hungary ---------------------------------------------------------------
  tokaj: {
    key: "tokaj", country: "Hungary", label: "Tokaj",
    bbox: [20.90, 47.90, 22.00, 48.55],
    centroid: { lon: 21.40, lat: 48.10 },
  },

  // United States ---------------------------------------------------------
  napa: {
    key: "napa", country: "United States", label: "Napa Valley",
    bbox: [-122.65, 38.15, -122.00, 38.90],
    centroid: { lon: -122.30, lat: 38.50 },
  },

  // Israel ----------------------------------------------------------------
  israel: {
    key: "israel", country: "Israel", label: "Israel",
    bbox: [34.20, 29.50, 35.90, 33.30],
    centroid: { lon: 35.00, lat: 31.50 },
  },
};

// ---------------------------------------------------------------------------
// Appellation points — each tagged with the region it belongs to.
// ---------------------------------------------------------------------------

export const WINE_MAP_POINTS: Record<string, WineMapPoint[]> = {
  France: [
    // Burgundy
    { label: "Burgundy", lon: 4.84, lat: 47.05, aliases: ["Bourgogne"], region_key: "burgundy" },
    { label: "Corton", lon: 4.87, lat: 47.07, region_key: "burgundy" },
    { label: "Nuits-Saint-Georges", lon: 4.95, lat: 47.14, region_key: "burgundy" },
    { label: "Volnay", lon: 4.78, lat: 47.00, region_key: "burgundy" },
    { label: "Puligny-Montrachet", lon: 4.75, lat: 46.95, region_key: "burgundy" },
    { label: "Monthélie", lon: 4.76, lat: 46.99, aliases: ["Monthelie"], region_key: "burgundy" },
    { label: "Pommard", lon: 4.79, lat: 46.98, region_key: "burgundy" },
    { label: "Beaune", lon: 4.84, lat: 47.03, region_key: "burgundy" },
    { label: "Chablis", lon: 3.80, lat: 47.81, region_key: "burgundy" },
    { label: "Mâcon", lon: 4.83, lat: 46.30, aliases: ["Macon", "Mâconnais"], region_key: "burgundy" },
    // Bordeaux
    { label: "Bordeaux", lon: -0.58, lat: 44.84, aliases: ["Bordeaux Blanc"], region_key: "bordeaux" },
    { label: "Margaux", lon: -0.67, lat: 45.04, region_key: "bordeaux" },
    { label: "Saint-Estèphe", lon: -0.77, lat: 45.26, aliases: ["Saint Estephe", "St. Estephe", "St Estephe"], region_key: "bordeaux" },
    { label: "Pessac-Léognan", lon: -0.62, lat: 44.72, aliases: ["Pessac Leognan", "Pessac-Leognan"], region_key: "bordeaux" },
    { label: "Saint-Émilion", lon: -0.16, lat: 44.89, aliases: ["Saint Emilion", "St. Emilion", "St Emilion", "Saint-Émilion Grand Cru"], region_key: "bordeaux" },
    { label: "Haut-Médoc", lon: -0.72, lat: 45.08, aliases: ["Haut Medoc"], region_key: "bordeaux" },
    { label: "Pomerol", lon: -0.20, lat: 44.93, region_key: "bordeaux" },
    { label: "Médoc", lon: -0.83, lat: 45.25, aliases: ["Medoc"], region_key: "bordeaux" },
    // Champagne
    { label: "Champagne", lon: 4.00, lat: 49.00, region_key: "champagne" },
    { label: "Reims", lon: 4.03, lat: 49.26, region_key: "champagne" },
    { label: "Épernay", lon: 3.96, lat: 49.04, aliases: ["Epernay"], region_key: "champagne" },
    // Loire
    { label: "Loire Valley", lon: 1.60, lat: 47.40, region_key: "loire" },
    { label: "Sancerre", lon: 2.84, lat: 47.33, region_key: "loire" },
    { label: "Pouilly-Fumé", lon: 2.95, lat: 47.28, aliases: ["Pouilly Fume", "Pouilly-Fume"], region_key: "loire" },
    { label: "Vouvray", lon: 0.80, lat: 47.40, region_key: "loire" },
    // Provence
    { label: "Provence", lon: 6.00, lat: 43.50, region_key: "provence" },
    { label: "Côtes de Provence", lon: 6.20, lat: 43.40, aliases: ["Cotes de Provence"], region_key: "provence" },
    // Languedoc
    { label: "Languedoc", lon: 3.00, lat: 43.50, region_key: "languedoc" },
    { label: "La Clape", lon: 3.15, lat: 43.17, aliases: ["La Clape, Languedoc"], region_key: "languedoc" },
    { label: "Pays d'Oc", lon: 3.00, lat: 43.60, aliases: ["Pays d’Oc"], region_key: "languedoc" },
  ],
  Italy: [
    // Tuscany
    { label: "Tuscany", lon: 11.10, lat: 43.00, aliases: ["Toscana"], region_key: "tuscany" },
    { label: "Chianti Classico", lon: 11.30, lat: 43.45, region_key: "tuscany" },
    { label: "Montalcino", lon: 11.49, lat: 43.06, aliases: ["Brunello di Montalcino", "Rosso di Montalcino"], region_key: "tuscany" },
    { label: "Maremma Toscana", lon: 11.00, lat: 42.80, aliases: ["Maremma"], region_key: "tuscany" },
    { label: "Bolgheri", lon: 10.60, lat: 43.22, region_key: "tuscany" },
    // Piedmont
    { label: "Piedmont", lon: 7.90, lat: 44.80, aliases: ["Piemonte"], region_key: "piedmont" },
    { label: "Barolo", lon: 7.94, lat: 44.61, region_key: "piedmont" },
    { label: "Barbaresco", lon: 8.09, lat: 44.72, region_key: "piedmont" },
    { label: "Terre Alfieri", lon: 8.00, lat: 44.90, region_key: "piedmont" },
    { label: "Barbera d'Asti", lon: 8.20, lat: 44.90, aliases: ["Barbera d’Asti"], region_key: "piedmont" },
    { label: "Monferrato Rosso", lon: 8.35, lat: 45.00, aliases: ["Monferrato"], region_key: "piedmont" },
    // Campania
    { label: "Campania", lon: 14.90, lat: 40.90, region_key: "campania" },
    { label: "Fiano di Avellino", lon: 14.84, lat: 40.92, region_key: "campania" },
    { label: "Greco di Tufo", lon: 14.82, lat: 41.01, region_key: "campania" },
    { label: "Irpinia Aglianico", lon: 14.90, lat: 40.95, aliases: ["Irpinia"], region_key: "campania" },
    // Sicily
    { label: "Sicily", lon: 14.00, lat: 37.60, aliases: ["Sicilia", "Terre Siciliane"], region_key: "sicily" },
    { label: "Etna", lon: 15.00, lat: 37.75, aliases: ["Etna Rosso", "Etna Bianco"], region_key: "sicily" },
    // Lazio
    { label: "Lazio", lon: 12.60, lat: 41.90, region_key: "lazio" },
    { label: "Frascati", lon: 12.68, lat: 41.80, region_key: "lazio" },
    // Umbria
    { label: "Umbria", lon: 12.50, lat: 42.90, region_key: "umbria" },
    { label: "Montefalco", lon: 12.65, lat: 42.90, aliases: ["Sagrantino di Montefalco"], region_key: "umbria" },
    // Abruzzo
    { label: "Abruzzo", lon: 13.90, lat: 42.30, region_key: "abruzzo" },
    { label: "Montepulciano d'Abruzzo", lon: 14.00, lat: 42.25, aliases: ["Montepulciano d’Abruzzo"], region_key: "abruzzo" },
    // Veneto
    { label: "Veneto", lon: 11.80, lat: 45.60, region_key: "veneto" },
    { label: "Valpolicella", lon: 10.95, lat: 45.52, aliases: ["Amarone della Valpolicella", "Amarone"], region_key: "veneto" },
    { label: "Soave", lon: 11.25, lat: 45.42, region_key: "veneto" },
    // Marche
    { label: "Marche", lon: 13.20, lat: 43.30, region_key: "marche" },
    { label: "Verdicchio dei Castelli di Jesi", lon: 13.25, lat: 43.52, aliases: ["Verdicchio"], region_key: "marche" },
  ],
  Germany: [
    { label: "Franken", lon: 10.10, lat: 49.80, region_key: "franken" },
    { label: "Mosel", lon: 6.90, lat: 49.90, region_key: "mosel" },
  ],
  Hungary: [
    { label: "Tokaj", lon: 21.40, lat: 48.10, region_key: "tokaj" },
  ],
  "United States": [
    { label: "California", lon: -119.70, lat: 36.80 },
    { label: "Napa Valley", lon: -122.30, lat: 38.50, region_key: "napa" },
  ],
  Israel: [
    { label: "Israel", lon: 35.20, lat: 31.50, region_key: "israel" },
    { label: "Galilee", lon: 35.50, lat: 32.80, region_key: "israel" },
    { label: "Judean Hills", lon: 35.10, lat: 31.70, region_key: "israel" },
  ],
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .trim()
    .toLowerCase();
}

export function findWineMapPoint(country: string, candidates: Array<string | null | undefined>): WineMapPoint | null {
  const points = WINE_MAP_POINTS[country] ?? [];
  const hay = candidates.filter(Boolean).map((x) => norm(String(x)));
  // Exact name / alias first.
  for (const p of points) {
    const names = [p.label, ...(p.aliases ?? [])].map(norm);
    if (hay.some((h) => names.includes(h))) return p;
  }
  // Then permit a location name to appear inside the wine title / designation.
  for (const p of points) {
    const names = [p.label, ...(p.aliases ?? [])].map(norm);
    if (hay.some((h) => names.some((n) => n.length >= 5 && h.includes(n)))) return p;
  }
  return null;
}

// Phase B — resolve a region from any available clue, in priority order:
//   1. the matched point already names its region
//   2. one of the location-chain names matches a WINE_REGIONS entry's label
//   3. one of the location-chain names matches via alias (region label equals
//      a known region's lowercased label)
export function findWineRegion(
  country: string,
  candidates: Array<string | null | undefined>,
  pointHint?: WineMapPoint | null,
): WineRegion | null {
  if (pointHint?.region_key && WINE_REGIONS[pointHint.region_key]) {
    const r = WINE_REGIONS[pointHint.region_key];
    if (r.country === country) return r;
  }
  const hay = candidates.filter(Boolean).map((x) => norm(String(x)));
  for (const r of Object.values(WINE_REGIONS)) {
    if (r.country !== country) continue;
    const label = norm(r.label);
    if (hay.includes(label)) return r;
    if (hay.some((h) => h.length >= 5 && h.includes(label))) return r;
  }
  return null;
}
