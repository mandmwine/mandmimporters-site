import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { one, query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import CatalogSharePanel, { type Share } from "@/components/CatalogSharePanel";
import CatalogSectionsReorder, { type SectionRow as DragSectionRow } from "@/components/CatalogSectionsReorder";
import CatalogItemsReorder, { type CatalogItemRow } from "@/components/CatalogItemsReorder";
import CopyButton from "@/components/CopyButton";
import UpdatedMeta from "@/components/UpdatedMeta";
import {
  addCatalogSection,
  deleteCatalog,
  renameCatalog,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

type Catalog = {
  id: string;
  name: string;
  season: string | null;
  render_mode: string;
  status: string;
  settings: Record<string, unknown>;
};

type Section = {
  id: string;
  kind: string;
  title: string | null;
  position: number;
  settings: Record<string, unknown>;
};

type Item = {
  id: string;
  position: number;
  section_id: string | null;
  wine_vintage_id: string;
  wine_name: string;
  producer: string;
  vintage_text: string | null;
  flag_count: number;
  has_image: boolean;
};

type ExportRow = {
  id: string;
  version_label: string;
  preset: string;
  status: string;
  asset_url: string | null;
  created_at: Date;
  completed_at: Date | null;
};

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

export default async function CatalogDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getSessionUser();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const c = await one<Catalog>("SELECT id, name, season, render_mode, status, settings FROM catalogs WHERE id = $1", [id]);
  if (!c) notFound();

  const [sections, items, exports, shares] = await Promise.all([
    query<Section>(
      "SELECT id, kind, title, position, settings FROM catalog_sections WHERE catalog_id = $1 ORDER BY position",
      [id],
    ),
    query<Item>(
      `SELECT ci.id, ci.position, ci.section_id, ci.wine_vintage_id,
              w.display_name AS wine_name, p.name AS producer, v.vintage_text,
              (SELECT count(*)::int FROM review_flags f
                 WHERE f.entity_type = 'wine_vintage' AND f.entity_id = v.id AND f.status = 'open') AS flag_count,
              (v.legacy->>'img' IS NOT NULL) AS has_image
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       JOIN wines w ON w.id = v.wine_id
       JOIN producers p ON p.id = w.producer_id
       WHERE ci.catalog_id = $1
       ORDER BY ci.position`,
      [id],
    ),
    query<ExportRow>(
      `SELECT ef.id, cv.version_label, ef.preset, ef.status,
              (SELECT storage_path FROM assets a WHERE a.id = ef.asset_id) AS asset_url,
              ef.created_at, ef.completed_at
       FROM export_files ef
       JOIN catalog_versions cv ON cv.id = ef.catalog_version_id
       WHERE cv.catalog_id = $1
       ORDER BY ef.created_at DESC LIMIT 20`,
      [id],
    ),
    query<Share>(
      `SELECT s.id, s.token, s.label, s.created_at, s.expires_at, s.revoked_at,
              s.view_count, s.last_viewed_at, u.email AS created_by_email
         FROM catalog_shares s
         LEFT JOIN users u ON u.id = s.created_by
         WHERE s.catalog_id = $1
         ORDER BY s.revoked_at NULLS FIRST, s.created_at DESC`,
      [id],
    ),
  ]);

  // Derive the share base URL (host + basePath) from the request headers so
  // the copyable URL shown in the UI matches whichever host the editor is on.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "mandmimporters.com";
  const shareBase = `${proto}://${host}/catalog-admin`;

  // Pre-flight checks are warnings, not blockers.
  const warnings: string[] = [];
  const missingImages = items.filter((i) => !i.has_image).length;
  if (missingImages) warnings.push(`${missingImages} wine${missingImages === 1 ? "" : "s"} missing a bottle image.`);
  const flagged = items.filter((i) => i.flag_count > 0).length;
  if (flagged) warnings.push(`${flagged} wine${flagged === 1 ? "" : "s"} have open review items.`);
  if (items.length === 0) warnings.push("No wines added yet. Add some from the Wines tab.");

  return (
    <>
      <p className="crumbs">
        <Link href="/catalogs">Catalogs</Link> / {c.name}
      </p>

      <header className="page-head row">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">
            {items.length} wine{items.length === 1 ? "" : "s"} · {sections.length} section{sections.length === 1 ? "" : "s"} · Layout: {c.render_mode}
          </p>
          <p className="small muted record-meta">
            <UpdatedMeta entityType="catalog" entityId={id} />
            {" · "}
            <CopyButton value={`${shareBase}/catalogs/${id}`} label="Copy link" compact />
            <CopyButton value={id} label="ID" compact />
          </p>
        </div>
        <div className="head-side">
          <div className="head-actions">
            <Link className="btn primary" href={`/catalogs/${id}/export`}>
              Export →
            </Link>
          </div>
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="panel notice-warn">
          <strong>Preflight</strong>
          <ul style={{ margin: "4px 0 0 20px" }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <p className="small muted" style={{ margin: "6px 0 0" }}>These do not block export. Fix what you want to; export when ready.</p>
        </div>
      )}

      <section className="split wide">
        <div>
          <div className="panel">
            <h2>Sections</h2>
            <p className="small muted">
              {canEdit ? "Drag the handle to reorder. " : ""}
              Each wines-section can use a different layout.
            </p>
            <CatalogSectionsReorder
              catalogId={id}
              canEdit={canEdit}
              sections={sections.map<DragSectionRow>((s) => ({
                id: s.id,
                kind: s.kind,
                title: s.title,
                layout: (s.settings?.layout as string) ?? "detailed",
                wine_count: items.filter((it) => it.section_id === s.id).length,
              }))}
            />
            {canEdit && (
              <form action={addCatalogSection} className="inline-form" style={{ marginTop: 12 }}>
                <input type="hidden" name="catalog_id" value={id} />
                <select name="kind" defaultValue="divider">
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input name="title" placeholder="Section title (optional)" />
                <button className="btn small" type="submit">+ Add section</button>
              </form>
            )}
          </div>

          <div className="panel">
            <h2>Wines in this catalog</h2>
            {items.length === 0 ? (
              <p className="muted">No wines yet. Go to <Link href="/wines">Wines</Link>, select some, then click "Add to existing" in the selection bar.</p>
            ) : (
              <CatalogItemsReorder
                catalogId={id}
                canEdit={canEdit}
                items={items.map<CatalogItemRow>((it) => ({
                  id: it.id,
                  wine_vintage_id: it.wine_vintage_id,
                  wine_name: it.wine_name,
                  producer: it.producer,
                  vintage_text: it.vintage_text,
                  has_image: it.has_image,
                  flag_count: it.flag_count,
                  section_id: it.section_id,
                }))}
              />
            )}
          </div>
        </div>

        <div>
          {canEdit && (
            <form className="panel form-grid" action={renameCatalog}>
              <h2>Catalog settings</h2>
              <input type="hidden" name="id" value={id} />
              <label>
                Name
                <input name="name" defaultValue={c.name} required />
              </label>
              <label>
                Season
                <input name="season" defaultValue={c.season ?? ""} placeholder="2026, Fall 2026, etc." />
              </label>
              <label>
                Overall render mode
                <select name="render_mode" defaultValue={c.render_mode}>
                  <option value="hybrid">Hybrid</option>
                  <option value="detailed">Detailed only</option>
                  <option value="compact">Compact only</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="btn primary small" type="submit">Save settings</button>
              </div>
            </form>
          )}

          <div className="panel">
            <h2>Export history</h2>
            {exports.length === 0 ? (
              <p className="muted small">No exports yet.</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {exports.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.version_label}</strong>
                        <div className="muted small">
                          {e.preset.toUpperCase()} ·{" "}
                          {e.completed_at
                            ? new Date(e.completed_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                            : "pending"}
                        </div>
                      </td>
                      <td className="small">
                        {e.status === "done" && e.asset_url ? (
                          <a href={e.asset_url} className="link">Download</a>
                        ) : (
                          <span className="muted">{e.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <CatalogSharePanel
            catalogId={id}
            shares={shares}
            basePath={shareBase}
            canEdit={canEdit}
          />

          {canEdit && (
            <form action={deleteCatalog} className="panel">
              <h2>Archive</h2>
              <p className="small muted">Archives the catalog composition. Past exports remain downloadable.</p>
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmit message="Archive this catalog?">Archive catalog</ConfirmSubmit>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
