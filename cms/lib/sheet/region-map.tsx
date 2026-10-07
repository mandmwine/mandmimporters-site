// Region map renderer for the single-wine sheet.
//
// Two layers:
//   1. GeoJSON (new): when an approved map_asset for the wine's location (or
//      any location above it in the hierarchy) exists, we render its GeoJSON
//      through lib/maps/render.ts, highlighting the wine's actual location by
//      name.  Loaded by lib/sheet/data.ts and passed in as `geoMap`.
//   2. Hand-drawn fallback (old): if no GeoJSON is approved yet, we fall back
//      to the hand-drawn country outlines in HAND_DRAWN below.  As the editor
//      approves more maps the hand-drawn layer fades away on its own.
import { renderMap, type GeoCollection, type GeoFeature } from "@/lib/maps/render";

type MapDef = {
  viewBox: string;
  outline: string;
  highlights?: Record<string, string>;
  cities?: Record<string, [number, number]>;
};

const HAND_DRAWN: Record<string, MapDef> = {
  Italy: {
    viewBox: "0 0 240 300",
    outline:
      "M118 20 L128 32 L140 52 L150 70 L155 95 L168 120 L178 142 L172 160 L188 172 L202 190 L212 212 L198 232 L178 230 L162 218 L148 228 L140 248 L132 262 L120 272 L100 258 L95 232 L88 210 L72 198 L60 182 L48 165 L55 148 L68 140 L78 128 L85 112 L88 92 L96 72 L102 52 L110 32 Z",
    highlights: {
      Tuscany: "M118 128 L140 125 L152 138 L148 158 L138 172 L120 170 L108 158 L108 142 Z",
      Piedmont: "M72 100 L95 95 L100 115 L92 128 L78 128 L68 118 Z",
      Veneto: "M138 85 L160 82 L168 95 L160 108 L142 108 Z",
      Campania: "M165 185 L182 182 L188 200 L182 215 L168 218 L160 205 Z",
      Sicily: "M135 258 L170 258 L178 270 L162 282 L138 278 L128 268 Z",
      Lazio: "M135 150 L155 148 L160 162 L148 175 L132 170 Z",
      Abruzzo: "M152 148 L172 148 L178 162 L170 175 L155 172 Z",
      Umbria: "M138 140 L155 138 L158 155 L148 162 L135 158 Z",
    },
    cities: { Florence: [128, 148], Siena: [128, 158] },
  },
  France: {
    viewBox: "0 0 240 260",
    outline:
      "M60 50 L82 42 L108 38 L128 48 L148 44 L170 52 L188 68 L198 90 L202 112 L210 138 L202 160 L188 180 L172 200 L152 212 L130 220 L108 216 L88 206 L70 190 L58 170 L52 148 L48 128 L50 108 L54 82 L58 62 Z",
    highlights: {
      Burgundy: "M138 108 L155 108 L160 128 L148 142 L132 138 L128 120 Z",
      Bordeaux: "M70 148 L95 148 L100 168 L85 182 L68 178 L62 162 Z",
      Champagne: "M138 72 L158 72 L162 90 L150 102 L132 98 Z",
      "Loire Valley": "M90 108 L120 105 L125 122 L108 135 L85 130 Z",
      Provence: "M160 178 L188 175 L192 192 L178 205 L158 200 Z",
      Languedoc: "M118 180 L148 178 L152 195 L132 208 L112 198 Z",
    },
  },
  Germany: {
    viewBox: "0 0 220 240",
    outline:
      "M60 40 L95 32 L130 36 L160 48 L178 70 L182 95 L188 118 L172 140 L158 162 L148 182 L132 198 L108 200 L88 192 L72 172 L60 150 L55 125 L52 102 L52 78 Z",
    highlights: {
      Mosel: "M70 108 L92 102 L98 120 L85 135 L70 130 Z",
      Franken: "M118 118 L138 115 L142 132 L128 142 L115 135 Z",
    },
  },
  "United States": {
    viewBox: "0 0 300 180",
    outline:
      "M20 70 L60 50 L120 42 L180 44 L240 50 L278 68 L285 90 L278 118 L250 135 L200 142 L140 142 L80 130 L40 112 L22 92 Z",
    highlights: {
      California: "M30 92 L52 85 L58 112 L45 128 L28 118 Z",
      "Napa Valley": "M38 95 L48 92 L52 105 L42 115 L35 108 Z",
    },
  },
  Israel: {
    viewBox: "0 0 160 240",
    outline: "M70 20 L95 25 L108 55 L112 90 L105 130 L95 170 L80 210 L60 215 L52 180 L58 140 L55 100 L60 60 Z",
    highlights: {
      Galilee: "M72 32 L92 32 L98 55 L85 72 L68 65 Z",
      "Judean Hills": "M70 110 L92 112 L95 135 L80 150 L65 138 Z",
    },
  },
  Hungary: {
    viewBox: "0 0 240 160",
    outline: "M30 60 L80 42 L140 40 L200 48 L220 72 L212 95 L180 112 L130 118 L80 112 L45 95 L28 78 Z",
    highlights: { Tokaj: "M152 60 L188 58 L195 78 L175 92 L148 85 Z" },
  },
};

type LocationFacts = {
  country: string | null;
  region: string | null;
  subregion: string | null;
  appellation: string | null;
};

export type GeoMap = {
  geojson: GeoCollection;
  location_name: string;      // the location this map covers (e.g. "Tuscany")
  highlight: string | null;   // name of the specific sub-feature to highlight
};

export function renderRegionMap(location: LocationFacts, geoMap?: GeoMap | null) {
  // 1. GeoJSON map (preferred) ------------------------------------------
  if (geoMap) {
    const r = renderMap(geoMap.geojson, {
      width: 320,
      padding: 0.04,
      highlightName: geoMap.highlight ?? null,
    });
    if (r.svg) {
      const captionTop = location.country ?? geoMap.location_name;
      const captionSub = geoMap.highlight ?? location.region ?? geoMap.location_name;
      return (
        <figure className="sheet__map sheet__map--geo">
          <svg
            viewBox={r.viewBox}
            xmlns="http://www.w3.org/2000/svg"
            aria-label={`Map of ${geoMap.location_name}${geoMap.highlight ? ` highlighting ${geoMap.highlight}` : ""}`}
            dangerouslySetInnerHTML={{ __html: r.svg }}
          />
          <figcaption>
            <span className="sheet__map-caption-country">{captionTop?.toUpperCase() ?? ""}</span>
            <span className="sheet__map-caption-region">{captionSub ?? ""}</span>
          </figcaption>
        </figure>
      );
    }
  }

  // 2. Hand-drawn fallback ----------------------------------------------
  const country = location.country;
  if (!country || !HAND_DRAWN[country]) {
    return (
      <div className="sheet__map sheet__map--placeholder">
        <span>{location.region ?? country ?? "Region map"}</span>
      </div>
    );
  }
  const def = HAND_DRAWN[country];
  const highlightKey =
    (location.appellation && def.highlights?.[location.appellation]) ? location.appellation :
    (location.subregion && def.highlights?.[location.subregion]) ? location.subregion :
    (location.region && def.highlights?.[location.region]) ? location.region :
    null;
  const highlightLabel = highlightKey ?? location.region ?? country;

  return (
    <figure className="sheet__map">
      <svg viewBox={def.viewBox} xmlns="http://www.w3.org/2000/svg" aria-label={`Map of ${country} highlighting ${highlightLabel}`}>
        <path d={def.outline} className="sheet__map-country" />
        {highlightKey && def.highlights?.[highlightKey] && (
          <path d={def.highlights[highlightKey]} className="sheet__map-highlight" />
        )}
        {def.cities && Object.entries(def.cities).map(([name, [x, y]]) => (
          <g key={name} className="sheet__map-city">
            <circle cx={x} cy={y} r="2" />
            <text x={x + 5} y={y + 3}>{name}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="sheet__map-caption-country">{country.toUpperCase()}</span>
        <span className="sheet__map-caption-region">{highlightLabel}</span>
      </figcaption>
    </figure>
  );
}

// Re-export the GeoFeature type so callers importing from here get both pieces.
export type { GeoFeature };
