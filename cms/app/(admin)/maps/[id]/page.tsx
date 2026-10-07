import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { renderMap, type GeoCollection } from "@/lib/maps/render";
import MapUploader from "@/components/MapUploader";
import MapVersionActions from "@/components/MapVersionActions";

export const dynamic = "force-dynamic";

type Location = {
  id: string;
  type: "country" | "region" | "subregion" | "appellation";
  name: string;
  parent_id: string | null;
  map_status: "needs_map" | "draft" | "approved";
};

type Version = {
  id: string;
  version: number;
  status: "draft" | "approved" | "retired";
  created_at: Date;
  approved_at: Date | null;
  approved_by_email: string | null;
  geojson: GeoCollection | null;
  feature_count: number;
};

type Wine = {
  id: string;
  display_name: string;
  vintage_text: string | null;
  producer: string;
};

export default async function MapDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canEdit = user.role === "admin" || user.role === "editor";

  const locMaybe = await one<Location>(
    "SELECT id, type, name, parent_id, map_status FROM locations WHERE id = $1",
    [id],
  );
  if (!locMaybe) notFound();
  const loc: Location = locMaybe;

  const [chain, versions, wines] = await Promise.all([
    query<{ id: string; type: string; name: string }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
         UNION ALL SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1
           FROM locations x JOIN up ON x.id = up.parent_id)
       SELECT id, type, name FROM up ORDER BY depth DESC`,
      [id],
    ),
    query<Version>(
      `SELECT m.id, m.version, m.status, m.created_at, m.approved_at, m.geojson,
          u.email AS approved_by_email,
          COALESCE(jsonb_array_length(m.geojson->'features'), 0) AS feature_count
       FROM map_assets m
       LEFT JOIN users u ON u.id = m.approved_by
       WHERE m.location_id = $1
       ORDER BY m.version DESC`,
      [id],
    ),
    query<Wine>(
      `SELECT v.id, w.display_name, v.vintage_text, p.name AS producer
       FROM wine_vintages v
       JOIN wines w ON w.id = v.wine_id
       JOIN producers p ON p.id = w.producer_id
       WHERE v.location_id = $1 AND v.deleted_at IS NULL
       ORDER BY p.name, w.display_name, v.vintage_text DESC
       LIMIT 60`,
      [id],
    ),
  ]);

  const approved = versions.find((v) => v.status === "approved");
  const drafts = versions.filter((v) => v.status === "draft");

  // Render previews up front — this is server-side and cheap.
  const previewCache = new Map<string, { svg: string; viewBox: string }>();
  function preview(geojson: GeoCollection | null, highlightName: string | null): { svg: string; viewBox: string } {
    if (!geojson) return { svg: "", viewBox: "0 0 320 320" };
    const key = `${(geojson.features?.length ?? 0)}:${highlightName ?? ""}:${JSON.stringify(geojson.features?.[0]?.properties ?? {})}`;
    const cached = previewCache.get(key);
    if (cached) return cached;
    const r = renderMap(geojson, { width: 320, padding: 0.05, highlightName });
    const out = { svg: r.svg, viewBox: r.viewBox };
    previewCache.set(key, out);
    return out;
  }

  return (
    <>
      <nav className="crumbs">
        <Link href="/maps">← Back to maps</Link>
      </nav>
      <header className="page-head row">
        <div>
          <p className="eyebrow">{chain.map((c) => c.name).join(" / ")}</p>
          <h1>{loc.name}</h1>
          <p className="muted">{loc.type} · {wines.length} wine{wines.length === 1 ? "" : "s"}</p>
        </div>
        <div className="head-side">
          <span className={`badge badge--${loc.map_status}`}>
            {loc.map_status === "needs_map" ? "Needs map" : loc.map_status === "draft" ? "Draft" : "Approved"}
          </span>
        </div>
      </header>

      <div className="map-detail">
        <div className="map-detail__preview">
          {approved && approved.geojson ? (() => {
            const p = preview(approved.geojson, loc.name);
            return (
              <div className="panel">
                <div className="panel-head">
                  <h2>Approved map · version {approved.version}</h2>
                  {canEdit && <MapVersionActions id={approved.id} status={approved.status} />}
                </div>
                <MapPreview svg={p.svg} viewBox={p.viewBox} />
                <p className="small muted">
                  {approved.feature_count} feature{approved.feature_count === 1 ? "" : "s"}
                  {approved.approved_at && ` · approved ${new Date(approved.approved_at).toLocaleDateString("en-US")}`}
                  {approved.approved_by_email && ` by ${approved.approved_by_email}`}
                </p>
              </div>
            );
          })() : (
            <div className="panel">
              <h2>No approved map yet</h2>
              <p className="muted">
                Upload or paste a GeoJSON FeatureCollection below. Any wine in {loc.name} will
                fall back to the parent region's approved map until this one is approved.
              </p>
            </div>
          )}

          {drafts.length > 0 && (
            <div className="panel">
              <h2>Draft versions</h2>
              <ul className="plain-list map-drafts">
                {drafts.map((d) => {
                  const p = preview(d.geojson, loc.name);
                  return (
                  <li key={d.id} className="map-draft">
                    <div className="map-draft__preview">
                      <MapPreview svg={p.svg} viewBox={p.viewBox} />
                    </div>
                    <div className="map-draft__meta">
                      <div className="strong">Version {d.version}</div>
                      <div className="small muted">
                        {d.feature_count} feature{d.feature_count === 1 ? "" : "s"} ·{" "}
                        created {new Date(d.created_at).toLocaleDateString("en-US")}
                      </div>
                      {canEdit && <MapVersionActions id={d.id} status={d.status} />}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {versions.length > drafts.length + (approved ? 1 : 0) && (
            <details className="panel">
              <summary>Retired versions ({versions.length - drafts.length - (approved ? 1 : 0)})</summary>
              <table className="table compact">
                <tbody>
                  {versions.filter((v) => v.status === "retired").map((v) => (
                    <tr key={v.id}>
                      <td>Version {v.version}</td>
                      <td className="small muted">
                        {v.approved_at
                          ? `was approved ${new Date(v.approved_at).toLocaleDateString("en-US")}`
                          : "never approved"}
                      </td>
                      <td className="right">
                        {canEdit && <MapVersionActions id={v.id} status={v.status} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>

        <div className="map-detail__side">
          {canEdit && (
            <div className="panel">
              <h2>Add a new version</h2>
              <MapUploader locationId={loc.id} locationName={loc.name} />
            </div>
          )}

          <div className="panel">
            <h2>Wines using this location</h2>
            {wines.length === 0 ? (
              <p className="muted">No wines yet.</p>
            ) : (
              <ul className="plain-list">
                {wines.map((w) => (
                  <li key={w.id} className="small">
                    <Link href={`/wines/${w.id}`}>
                      {w.producer} — {w.display_name}
                      {w.vintage_text ? ` ${w.vintage_text}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MapPreview({ svg, viewBox }: { svg: string; viewBox: string }) {
  return (
    <div className="map-preview">
      <svg
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
