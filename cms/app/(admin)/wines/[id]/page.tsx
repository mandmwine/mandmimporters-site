import Link from "next/link";
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { SeverityBadge, StatusBadge } from "@/components/Badge";
import FlagButtons from "@/components/FlagButtons";
import AddVintageButton from "@/components/AddVintageButton";
import ScoresPanel, { type ScoreRow } from "@/components/ScoresPanel";
import { EditableCopy, EditableGrapes, EditableTechnical } from "@/components/WineEditSections";
import BottleImagePanel from "@/components/BottleImagePanel";
import AIFieldButton from "@/components/AIFieldButton";
import WineWorkspace, { type WorkspaceSection } from "@/components/WineWorkspace";
import SourcesPanel from "@/components/SourcesPanel";

export const dynamic = "force-dynamic";

type Vintage = {
  id: string; wine_id: string; vintage_text: string | null; status: string; mevushal: string;
  supervision_display: string | null; aging_display: string | null; bottle_sizes: string[];
  special_designation: string | null; tasting_note: string | null; food_pairing: string | null;
  short_description: string | null; wine_story: string | null;
  first_kosher_vintage: boolean | null; organic: boolean | null; biodynamic: boolean | null;
  legacy: Record<string, unknown>; updated_at: Date;
  bottle_asset_id: string | null;
  display_name: string; canonical_name: string; category: string | null; slug: string; website_slug: string | null;
  producer_id: string; producer: string; location_id: string | null;
};

function fmtPct(p: string | null) {
  if (p === null) return "";
  const n = Number(p);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}% `;
}

export default async function WineDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getSessionUser();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const v = await one<Vintage>(
    `SELECT v.id, v.wine_id, v.vintage_text, v.status, v.mevushal, v.supervision_display,
            v.aging_display, v.bottle_sizes, v.special_designation, v.tasting_note, v.food_pairing,
            v.short_description, v.wine_story, v.first_kosher_vintage, v.organic, v.biodynamic,
            v.legacy, v.updated_at, v.location_id, v.bottle_asset_id,
            w.display_name, w.canonical_name, w.category, w.slug, w.website_slug, w.producer_id,
            p.name AS producer
     FROM wine_vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id
     WHERE v.id = $1`,
    [id],
  );
  if (!v) notFound();

  const [chain, siblings, grapes, scores, supervision, flags, provenance, criticOptions, recentBottles] = await Promise.all([
    query<{ type: string; name: string }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
         UNION ALL SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1 FROM locations x JOIN up ON x.id = up.parent_id)
       SELECT type, name FROM up ORDER BY depth DESC`,
      [v.location_id],
    ),
    query<{ id: string; vintage_text: string | null; status: string }>(
      "SELECT id, vintage_text, status FROM wine_vintages WHERE wine_id = $1 AND deleted_at IS NULL ORDER BY vintage_text DESC NULLS LAST",
      [v.wine_id],
    ),
    query<{ name: string; percentage: string | null }>(
      `SELECT g.canonical_name AS name, wg.percentage FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
       WHERE wg.wine_vintage_id = $1 ORDER BY wg.display_order`,
      [id],
    ),
    query<ScoreRow>(
      `SELECT s.id, c.canonical_name AS critic, s.score_text, s.award_text, s.is_primary, s.raw_text,
              s.review_year, s.review_url
       FROM wine_scores s LEFT JOIN critics c ON c.id = s.critic_id
       WHERE s.wine_vintage_id = $1 ORDER BY s.display_order`,
      [id],
    ),
    query<{ name: string }>(
      `SELECT a.canonical_name AS name FROM wine_supervision ws JOIN supervision_authorities a ON a.id = ws.authority_id
       WHERE ws.wine_vintage_id = $1 ORDER BY ws.display_order`,
      [id],
    ),
    query<{ id: string; field_name: string | null; flag_type: string; severity: string; message: string; status: string }>(
      `SELECT id, field_name, flag_type, severity, message, status FROM review_flags
       WHERE entity_type = 'wine_vintage' AND entity_id = $1
       ORDER BY status = 'open' DESC, CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at`,
      [id],
    ),
    query<{
      id: string; field_name: string; raw_value: string | null;
      verification_status: "unverified" | "verified" | "conflict" | "rejected";
      verified_at: Date | null; verified_by_email: string | null; is_current: boolean;
      source_title: string | null; source_url: string | null; source_type: string | null;
      source_locator: string | null; conflict_count: number;
    }>(
      `SELECT fp.id, fp.field_name, fp.raw_value, fp.verification_status, fp.verified_at,
              fp.is_current, fp.source_locator,
              u.email AS verified_by_email,
              s.title AS source_title, s.url AS source_url, s.source_type AS source_type,
              (SELECT count(*)::int FROM field_provenance x
                 WHERE x.entity_type = fp.entity_type AND x.entity_id = fp.entity_id
                   AND x.field_name = fp.field_name AND x.id <> fp.id AND x.is_current) AS conflict_count
       FROM field_provenance fp
       LEFT JOIN sources s ON s.id = fp.source_id
       LEFT JOIN users u ON u.id = fp.verified_by
       WHERE fp.entity_type = 'wine_vintage' AND fp.entity_id = $1
       ORDER BY fp.field_name, fp.is_current DESC, fp.verification_status, fp.created_at DESC`,
      [id],
    ),
    query<{ canonical_name: string }>("SELECT canonical_name FROM critics ORDER BY canonical_name"),
    query<{ id: string; file_name: string | null; width_px: number | null; height_px: number | null; mime_type: string | null }>(
      `SELECT id, file_name, width_px, height_px, mime_type
       FROM assets WHERE kind = 'bottle' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 24`,
    ),
  ]);

  const loc = (t: string) => chain.find((c) => c.type === t)?.name;
  const yesNo = (b: boolean | null) => (b === null ? null : b ? "Yes" : "No");
  const grapesText = grapes
    .map((g) => (g.percentage ? `${fmtPct(g.percentage).trim()} ${g.name}` : g.name))
    .join(", ");

  const facts: [string, string | null | undefined][] = [
    ["Producer", v.producer],
    ["Country", loc("country")],
    ["Region", loc("region")],
    ["Subregion", loc("subregion")],
    ["Appellation", loc("appellation")],
    ["Designation", v.special_designation],
    ["Aging", v.aging_display],
    ["Bottle sizes", v.bottle_sizes.join(", ") || null],
    ["Mevushal", v.mevushal === "unknown" ? null : v.mevushal === "yes" ? "Yes" : "No"],
    ["Supervision", supervision.map((s) => s.name).join(" · ") || v.supervision_display],
    ["First kosher vintage", yesNo(v.first_kosher_vintage)],
    ["Organic", yesNo(v.organic)],
    ["Biodynamic", yesNo(v.biodynamic)],
  ];
  const legacy = v.legacy as Record<string, unknown>;
  const openFlags = flags.filter((f) => f.status === "open");

  // ----------------------------------------------------- completeness
  const completenessChecks: { label: string; ok: boolean }[] = [
    { label: "Vintage set", ok: Boolean(v.vintage_text) },
    { label: "Mevushal recorded", ok: v.mevushal !== "unknown" },
    { label: "Supervision recorded", ok: Boolean(supervision.length || v.supervision_display) },
    { label: "Grape blend set", ok: grapes.length > 0 },
    { label: "At least one score", ok: scores.length > 0 },
    { label: "Tasting note", ok: Boolean(v.tasting_note) },
    { label: "Bottle image", ok: Boolean(v.bottle_asset_id) },
  ];
  const filled = completenessChecks.filter((c) => c.ok).length;

  const sections: WorkspaceSection[] = [
    {
      id: "technical",
      label: "Technical",
      state: (v.vintage_text && v.mevushal !== "unknown" && (supervision.length || v.supervision_display)) ? "ok" : "missing",
      hint:
        !v.vintage_text ? "No vintage" :
        v.mevushal === "unknown" ? "Mevushal unknown" :
        !supervision.length && !v.supervision_display ? "No supervision" :
        undefined,
    },
    {
      id: "grapes",
      label: "Grapes",
      state: grapes.length > 0 ? "ok" : "missing",
      hint: grapes.length === 0 ? "Not set" : undefined,
    },
    {
      id: "scores",
      label: "Scores",
      state: scores.length > 0 ? "ok" : "missing",
      hint: scores.length === 0 ? "None added" : `${scores.length} score${scores.length === 1 ? "" : "s"}`,
    },
    {
      id: "copy",
      label: "Copy",
      state: v.tasting_note
        ? (v.tasting_note.length > 450 ? "warn" : "ok")
        : "missing",
      hint:
        !v.tasting_note ? "No tasting note" :
        v.tasting_note.length > 450 ? `${v.tasting_note.length} chars (long)` :
        undefined,
    },
    {
      id: "bottle",
      label: "Bottle image",
      state: v.bottle_asset_id ? "ok" : "missing",
      hint: v.bottle_asset_id ? undefined : "Not uploaded",
    },
    {
      id: "review",
      label: "Review items",
      state: openFlags.length === 0 ? "info" : openFlags.some((f) => f.severity === "error") ? "warn" : "info",
      hint: openFlags.length === 0 ? undefined : `${openFlags.length} open`,
    },
    {
      id: "sources",
      label: "Sources",
      state: provenance.length > 0 ? "info" : "info",
      hint: provenance.length > 0 ? `${provenance.length} field${provenance.length === 1 ? "" : "s"}` : undefined,
    },
  ];

  const technicalSummary = (
    <dl className="specs">
      {facts.map(([k, val]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{val ? val : <span className="missing">not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  );

  const copySummary = (
    <>
      <h3>Tasting note</h3>
      <p>{v.tasting_note ?? <span className="missing">none</span>}</p>
      {v.tasting_note && (
        <p className={`small ${v.tasting_note.length > 450 ? "warn-text" : "muted"}`}>
          {v.tasting_note.length} characters (target 250–450)
        </p>
      )}
      <h3>Food pairing</h3>
      <p>{v.food_pairing ?? <span className="missing">none</span>}</p>
      {v.short_description && (
        <>
          <h3>Short description</h3>
          <p>{v.short_description}</p>
        </>
      )}
    </>
  );

  const grapesSummary = (
    <p className={grapesText ? "" : "missing"}>{grapesText || "Not recorded"}</p>
  );

  const editableVintage = {
    id: v.id,
    vintage_text: v.vintage_text,
    status: v.status,
    mevushal: v.mevushal,
    supervision_display: v.supervision_display,
    aging_display: v.aging_display,
    bottle_sizes: v.bottle_sizes,
    special_designation: v.special_designation,
    tasting_note: v.tasting_note,
    food_pairing: v.food_pairing,
    short_description: v.short_description,
    first_kosher_vintage: v.first_kosher_vintage,
    organic: v.organic,
    biodynamic: v.biodynamic,
    wine_story: v.wine_story,
  };

  const vintageTabs = (
    <nav className="rail-vintages__tabs">
      {siblings.map((s) => (
        <Link key={s.id} href={`/wines/${s.id}`} className={s.id === id ? "active" : undefined}>
          {s.vintage_text ?? "No vintage"}
        </Link>
      ))}
      {canEdit && <AddVintageButton wineId={v.wine_id} hasExisting={siblings.length > 0} />}
    </nav>
  );

  return (
    <>
      <p className="crumbs">
        <Link href="/wines">Wines</Link> / {v.producer}
      </p>
      <header className="page-head row wine-head">
        <div>
          <p className="eyebrow">{v.vintage_text ?? "Vintage not set"}</p>
          <h1>{v.display_name}</h1>
          <p className="muted">
            {[loc("appellation"), loc("region"), loc("country")].filter(Boolean).join(" · ")}
            {v.category ? ` · ${v.category}` : ""}
          </p>
        </div>
        <div className="head-side">
          <StatusBadge status={v.status} />
          <div className="head-actions">
            <Link className="btn primary" href={`/sheet/${id}`} target="_blank" rel="noreferrer">
              Open sheet ↗
            </Link>
            <div className="export-group">
              <span className="muted small">Export</span>
              <a className="link small" href={`/catalog-admin/api/wines/${id}/pdf?preset=print`}>Print</a>
              <a className="link small" href={`/catalog-admin/api/wines/${id}/pdf?preset=email`}>Email</a>
              <a className="link small" href={`/catalog-admin/api/wines/${id}/pdf?preset=web`}>Web</a>
            </div>
          </div>
          {v.website_slug && (
            <a className="link small" href={`https://www.mandmimporters.com/wines/p/${v.website_slug}`} target="_blank" rel="noreferrer">
              Public page ↗
            </a>
          )}
        </div>
      </header>

      <WineWorkspace
        sheetUrl={`/catalog-admin/sheet/${id}`}
        version={new Date(v.updated_at).toISOString()}
        sections={sections}
        completeness={{ filled, total: completenessChecks.length }}
        vintageTabs={vintageTabs}
      >
        <section id="sec-technical">
          <EditableTechnical v={editableVintage} summary={technicalSummary} canEdit={canEdit} />
        </section>

        <section id="sec-grapes">
          <EditableGrapes vintageId={id} grapesText={grapesText} summary={grapesSummary} canEdit={canEdit} />
        </section>

        <section id="sec-scores">
          <div className="panel">
            <div className="panel-head">
              <h2>Scores</h2>
              {canEdit && (
                <AIFieldButton
                  wineVintageId={id}
                  field="scores"
                  actions={["find_scores"]}
                />
              )}
            </div>
            <ScoresPanel
              vintageId={id}
              scores={scores}
              criticOptions={criticOptions.map((c) => c.canonical_name)}
              canEdit={canEdit}
            />
          </div>
        </section>

        <section id="sec-copy">
          <EditableCopy
            v={editableVintage}
            summary={copySummary}
            canEdit={canEdit}
            aiButtons={
              canEdit ? (
                <AIFieldButton
                  wineVintageId={id}
                  field="tasting_note"
                  actions={
                    v.tasting_note
                      ? ["rewrite_voice", "condense", "tasting_note"]
                      : ["tasting_note"]
                  }
                />
              ) : null
            }
          />
        </section>

        <section id="sec-bottle">
          <div className="panel">
            <h2>Bottle image</h2>
            <BottleImagePanel
              wineVintageId={id}
              currentAssetId={v.bottle_asset_id}
              recentAssets={recentBottles}
              fallbackImage={
                typeof v.legacy?.img === "string"
                  ? (v.legacy.img as string).startsWith("http")
                    ? (v.legacy.img as string)
                    : `https://www.mandmimporters.com${v.legacy.img as string}`
                  : null
              }
              resolutionWarning={null}
            />
          </div>
        </section>

        <section id="sec-review">
          <div className="panel">
            <h2>Review items {openFlags.length > 0 && <span className="pill">{openFlags.length}</span>}</h2>
            {flags.length === 0 ? (
              <p className="muted">No review items.</p>
            ) : (
              <ul className="flags">
                {flags.map((f) => (
                  <li key={f.id} className={f.status !== "open" ? "closed" : undefined}>
                    <SeverityBadge severity={f.severity} />
                    <div>
                      <p>{f.message}</p>
                      <div className="muted small">
                        {f.field_name ? `${f.field_name.replace(/_/g, " ")} · ` : ""}
                        {f.status !== "open" ? f.status : f.flag_type.replace(/_/g, " ")}
                        {canEdit && <> · <FlagButtons id={f.id} status={f.status} /></>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="sec-sources">
          <SourcesPanel
            entityType="wine_vintage"
            entityId={id}
            rows={provenance}
            canEdit={canEdit}
            fieldSuggestions={[
              "vintage_text", "mevushal", "supervision_display",
              "aging_display", "special_designation", "tasting_note",
              "food_pairing", "short_description", "wine_story",
              "grapes", "scores", "bottle_sizes",
              "first_kosher_vintage", "organic", "biodynamic",
            ]}
          />

          {Object.keys(legacy).length > 0 && (
            <details className="panel">
              <summary>Original imported copy</summary>
              <p className="muted small">Kept exactly as imported. Never edited.</p>
              <dl className="specs small">
                {["expert_note", "serve", "region_text", "grape_text", "vintages", "score"].map((k) =>
                  legacy[k] ? (
                    <div key={k}>
                      <dt>{k.replace(/_/g, " ")}</dt>
                      <dd>{String(legacy[k])}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </details>
          )}
        </section>
      </WineWorkspace>
    </>
  );
}
