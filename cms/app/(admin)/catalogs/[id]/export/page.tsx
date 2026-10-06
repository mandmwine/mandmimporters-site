// Preflight screen the Export button goes through before firing the PDF
// generator. Shows every warning that would be worth looking at (missing
// image, missing map, open review flags, text overflow risk, large catalog
// size) and surfaces the Print/Email/Web preset picker.
import Link from "next/link";
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  cover: "Cover",
  intro: "M&M Intro",
  toc: "Table of Contents",
  regional_index: "Regional Index",
  divider: "Section Divider",
  producer_intro: "Producer Intro",
  wines: "Wines",
  producer_index: "Producer Index",
  contact: "Contact",
  back_cover: "Back Cover",
};

type Catalog = { id: string; name: string; render_mode: string };
type Section = { id: string; kind: string; title: string | null; position: number; settings: Record<string, unknown>; wine_count: number };
type IssueRow = {
  wine_vintage_id: string;
  display_name: string;
  producer: string;
  vintage_text: string | null;
  has_image: boolean;
  has_map: boolean;
  open_flags: number;
  tasting_len: number;
  score_count: number;
};

export default async function PreflightPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const catalog = await one<Catalog>(
    "SELECT id, name, render_mode FROM catalogs WHERE id = $1",
    [id],
  );
  if (!catalog) notFound();

  const sections = await query<Section>(
    `SELECT cs.id, cs.kind, cs.title, cs.position, cs.settings,
       (SELECT count(*)::int FROM catalog_items ci WHERE ci.section_id = cs.id) AS wine_count
     FROM catalog_sections cs WHERE cs.catalog_id = $1 ORDER BY cs.position`,
    [id],
  );

  const issues = await query<IssueRow>(
    `SELECT v.id AS wine_vintage_id, w.display_name, p.name AS producer, v.vintage_text,
       (v.legacy->>'img' IS NOT NULL) AS has_image,
       EXISTS (
         WITH RECURSIVE up AS (
           SELECT id, parent_id FROM locations WHERE id = v.location_id
           UNION ALL SELECT x.id, x.parent_id FROM locations x JOIN up ON x.id = up.parent_id
         )
         SELECT 1 FROM map_assets m WHERE m.status = 'approved' AND m.location_id IN (SELECT id FROM up)
       ) AS has_map,
       (SELECT count(*)::int FROM review_flags f WHERE f.entity_type = 'wine_vintage' AND f.entity_id = v.id AND f.status = 'open') AS open_flags,
       coalesce(length(v.tasting_note), 0) AS tasting_len,
       (SELECT count(*)::int FROM wine_scores s WHERE s.wine_vintage_id = v.id) AS score_count
     FROM catalog_items ci
     JOIN wine_vintages v ON v.id = ci.wine_vintage_id
     JOIN wines w ON w.id = v.wine_id
     JOIN producers p ON p.id = w.producer_id
     WHERE ci.catalog_id = $1
     ORDER BY ci.position`,
    [id],
  );

  // Compute page count estimate from the sections.
  let estPages = 0;
  for (const s of sections) {
    if (s.kind === "wines") {
      const layout = (s.settings?.layout as string) ?? catalog.render_mode ?? "detailed";
      const perPage = layout === "detailed" ? 1 : layout === "lineup" ? 4 : layout === "trade" ? 8 : 6;
      estPages += Math.ceil(s.wine_count / perPage);
    } else {
      estPages += 1;
    }
  }

  const missingImage = issues.filter((i) => !i.has_image);
  const missingMap = issues.filter((i) => !i.has_map);
  const noScores = issues.filter((i) => i.score_count === 0);
  const noTasting = issues.filter((i) => i.tasting_len === 0);
  const overflow = issues.filter((i) => i.tasting_len > 500);
  const noVintage = issues.filter((i) => !i.vintage_text);
  const openFlags = issues.filter((i) => i.open_flags > 0);

  const warningSets: { label: string; wines: IssueRow[]; severity: "info" | "warn" }[] = [
    { label: "No bottle image", wines: missingImage, severity: "warn" },
    { label: "No approved region map (defaults will be used)", wines: missingMap, severity: "info" },
    { label: "No tasting note", wines: noTasting, severity: "warn" },
    { label: "No scores yet", wines: noScores, severity: "info" },
    { label: "Vintage not set", wines: noVintage, severity: "warn" },
    { label: "Tasting note may overflow the sheet", wines: overflow, severity: "info" },
    { label: "Open review items on wine", wines: openFlags, severity: "info" },
  ];
  const anyWarnings = warningSets.some((s) => s.wines.length > 0);

  return (
    <>
      <p className="crumbs">
        <Link href="/catalogs">Catalogs</Link> /{" "}
        <Link href={`/catalogs/${id}`}>{catalog.name}</Link> / Preflight
      </p>

      <header className="page-head">
        <h1>Preflight: {catalog.name}</h1>
        <p className="muted">
          {issues.length} wine{issues.length === 1 ? "" : "s"} across {sections.length} section
          {sections.length === 1 ? "" : "s"} · estimated {estPages} page{estPages === 1 ? "" : "s"}
        </p>
      </header>

      <section className="split wide">
        <div>
          {anyWarnings ? (
            <div className="panel">
              <h2>Warnings</h2>
              <p className="small muted">Warnings do not block export. Fix what you want to; export when ready.</p>
              {warningSets.map(
                (s) =>
                  s.wines.length > 0 && (
                    <details key={s.label} className="preflight-group">
                      <summary>
                        <span className={`badge sev-${s.severity === "warn" ? "warning" : "info"}`}>
                          {s.wines.length}
                        </span>
                        {s.label}
                      </summary>
                      <ul className="preflight-list">
                        {s.wines.slice(0, 50).map((w) => (
                          <li key={w.wine_vintage_id}>
                            <Link href={`/wines/${w.wine_vintage_id}`}>
                              {w.display_name}
                              {w.vintage_text ? ` ${w.vintage_text}` : ""}
                            </Link>
                            <span className="muted small"> · {w.producer}</span>
                          </li>
                        ))}
                        {s.wines.length > 50 && (
                          <li className="muted small">… and {s.wines.length - 50} more.</li>
                        )}
                      </ul>
                    </details>
                  ),
              )}
            </div>
          ) : (
            <div className="panel">
              <h2>No warnings</h2>
              <p className="muted">
                Every wine has a bottle image, a tasting note, and no open review items. Pick a preset on the right.
              </p>
            </div>
          )}

          <div className="panel">
            <h2>Structure</h2>
            <ol className="section-list">
              {sections.map((s) => (
                <li key={s.id}>
                  <div className="section-row">
                    <div>
                      <strong>{KIND_LABEL[s.kind] ?? s.kind}</strong>
                      {s.title && s.title !== s.kind && <span className="muted"> · {s.title}</span>}
                      {s.kind === "wines" && (
                        <div className="muted small">
                          {s.wine_count} wine{s.wine_count === 1 ? "" : "s"} ·{" "}
                          layout: {(s.settings?.layout as string) ?? catalog.render_mode}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Export</h2>
            <p className="small muted">
              Each preset produces a PDF and records a version in the catalog's history.
            </p>
            <ul className="preset-list">
              <li>
                <a className="btn primary" href={`/catalog-admin/api/catalogs/${id}/export?preset=print`}>
                  Print quality
                </a>
                <p className="small muted">US Letter · high-resolution bitmaps · ~largest file</p>
              </li>
              <li>
                <a className="btn" href={`/catalog-admin/api/catalogs/${id}/export?preset=email`}>
                  Email / download
                </a>
                <p className="small muted">Medium resolution · suitable for sending as attachment</p>
              </li>
              <li>
                <a className="btn" href={`/catalog-admin/api/catalogs/${id}/export?preset=web`}>
                  Web / compressed
                </a>
                <p className="small muted">Smallest file · fast download, screen reading</p>
              </li>
            </ul>
            <p className="small muted" style={{ marginTop: 12 }}>
              First export of the session takes ~30s while Chromium warms up. Catalogs over 60 pages may take
              several minutes.
            </p>
          </div>

          <div className="panel">
            <h2>About warnings</h2>
            <p className="small muted">
              <strong>Needs fix:</strong> missing bottle image, missing tasting note, missing vintage.
            </p>
            <p className="small muted">
              <strong>Note:</strong> missing maps (we fall back to broader area), missing scores (section
              collapses), long tasting notes (may auto-fit), open review flags (editorial — not render).
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
