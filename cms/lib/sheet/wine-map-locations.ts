export type WineMapPoint = {
  label: string;
  lon: number;
  lat: number;
  aliases?: string[];
};

// Approximate appellation/region centroids used only for a clean locator map.
// They intentionally locate the appellation rather than pretending to draw an
// official legal boundary when an approved appellation GeoJSON is unavailable.
export const WINE_MAP_POINTS: Record<string, WineMapPoint[]> = {
  France: [
    { label: "Burgundy", lon: 4.84, lat: 47.05, aliases: ["Bourgogne"] },
    { label: "Corton", lon: 4.87, lat: 47.07 },
    { label: "Nuits-Saint-Georges", lon: 4.95, lat: 47.14 },
    { label: "Volnay", lon: 4.78, lat: 47.00 },
    { label: "Puligny-Montrachet", lon: 4.75, lat: 46.95 },
    { label: "Monthélie", lon: 4.76, lat: 46.99, aliases: ["Monthelie"] },
    { label: "Pommard", lon: 4.79, lat: 46.98 },
    { label: "Beaune", lon: 4.84, lat: 47.03 },
    { label: "Bordeaux", lon: -0.58, lat: 44.84, aliases: ["Bordeaux Blanc"] },
    { label: "Margaux", lon: -0.67, lat: 45.04 },
    { label: "Saint-Estèphe", lon: -0.77, lat: 45.26, aliases: ["Saint Estephe", "St. Estephe", "St Estephe"] },
    { label: "Pessac-Léognan", lon: -0.62, lat: 44.72, aliases: ["Pessac Leognan", "Pessac-Leognan"] },
    { label: "Saint-Émilion", lon: -0.16, lat: 44.89, aliases: ["Saint Emilion", "St. Emilion", "St Emilion", "Saint-Émilion Grand Cru"] },
    { label: "Haut-Médoc", lon: -0.72, lat: 45.08, aliases: ["Haut Medoc"] },
    { label: "Pomerol", lon: -0.20, lat: 44.93 },
    { label: "Médoc", lon: -0.83, lat: 45.25, aliases: ["Medoc"] },
    { label: "Champagne", lon: 4.00, lat: 49.00 },
    { label: "Loire Valley", lon: 1.60, lat: 47.40 },
    { label: "Sancerre", lon: 2.84, lat: 47.33 },
    { label: "Provence", lon: 6.00, lat: 43.50 },
    { label: "Côtes de Provence", lon: 6.20, lat: 43.40, aliases: ["Cotes de Provence"] },
    { label: "Languedoc", lon: 3.00, lat: 43.50 },
    { label: "La Clape", lon: 3.15, lat: 43.17, aliases: ["La Clape, Languedoc"] },
    { label: "Pays d'Oc", lon: 3.00, lat: 43.60, aliases: ["Pays d’Oc"] },
  ],
  Italy: [
    { label: "Tuscany", lon: 11.10, lat: 43.00, aliases: ["Toscana"] },
    { label: "Chianti Classico", lon: 11.30, lat: 43.45 },
    { label: "Montalcino", lon: 11.49, lat: 43.06, aliases: ["Brunello di Montalcino", "Rosso di Montalcino"] },
    { label: "Maremma Toscana", lon: 11.00, lat: 42.80, aliases: ["Maremma"] },
    { label: "Piedmont", lon: 7.90, lat: 44.80 },
    { label: "Barolo", lon: 7.94, lat: 44.61 },
    { label: "Terre Alfieri", lon: 8.00, lat: 44.90 },
    { label: "Barbera d'Asti", lon: 8.20, lat: 44.90, aliases: ["Barbera d’Asti"] },
    { label: "Monferrato Rosso", lon: 8.35, lat: 45.00, aliases: ["Monferrato"] },
    { label: "Campania", lon: 14.90, lat: 40.90 },
    { label: "Fiano di Avellino", lon: 14.84, lat: 40.92 },
    { label: "Greco di Tufo", lon: 14.82, lat: 41.01 },
    { label: "Irpinia Aglianico", lon: 14.90, lat: 40.95, aliases: ["Irpinia"] },
    { label: "Sicily", lon: 14.00, lat: 37.60, aliases: ["Sicilia", "Terre Siciliane"] },
    { label: "Lazio", lon: 12.60, lat: 41.90 },
    { label: "Umbria", lon: 12.50, lat: 42.90 },
    { label: "Abruzzo", lon: 13.90, lat: 42.30 },
  ],
  Germany: [
    { label: "Franken", lon: 10.10, lat: 49.80 },
    { label: "Mosel", lon: 6.90, lat: 49.90 },
  ],
  Hungary: [
    { label: "Tokaj", lon: 21.40, lat: 48.10 },
  ],
  "United States": [
    { label: "California", lon: -119.70, lat: 36.80 },
    { label: "Napa Valley", lon: -122.30, lat: 38.50 },
  ],
  Israel: [
    { label: "Israel", lon: 35.20, lat: 31.50 },
    { label: "Galilee", lon: 35.50, lat: 32.80 },
    { label: "Judean Hills", lon: 35.10, lat: 31.70 },
  ],
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
