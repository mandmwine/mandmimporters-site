import Link from "next/link";
import { query } from "@/lib/db";
import AssetUploader from "@/components/AssetUploader";

export const dynamic = "force-dynamic";

type Asset = {
  id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  bytes: number;
  created_at: Date;
  used_count: number;
  bottle_vintage_id: string | null;
  wine_display_name: string | null;
  wine_vintage_text: string | null;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const kindFilter = sp.kind ?? "";

  const where: string[] = ["a.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (kindFilter) {
    params.push(kindFilter);
    where.push(`a.kind = $${params.length}`);
  }

  const rows = await query<Asset>(
    `SELECT a.id, a.kind, a.file_name, a.mime_type, a.width_px, a.height_px, a.bytes, a.created_at,
       (SELECT count(*)::int FROM wine_assets wa WHERE wa.asset_id = a.id) AS used_count,
       (SELECT v.id FROM wine_vintages v WHERE v.bottle_asset_id = a.id LIMIT 1) AS bottle_vintage_id,
       (SELECT w.display_name FROM wine_vintages v
          JOIN wines w ON w.id = v.wine_id
          WHERE v.bottle_asset_id = a.id LIMIT 1) AS wine_display_name,
       (SELECT v.vintage_text FROM wine_vintages v WHERE v.bottle_asset_id = a.id LIMIT 1) AS wine_vintage_text
     FROM assets a
     WHERE ${where.join(" AND ")}
     ORDER BY a.created_at DESC
     LIMIT 500`,
    params,
  );

  const [{ total_bytes }] = await query<{ total_bytes: number }>(
    "SELECT coalesce(sum(bytes), 0)::bigint AS total_bytes FROM assets WHERE deleted_at IS NULL",
  );
  const totalMb = Number(total_bytes) / 1024 / 1024;

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Assets</h1>
          <p className="muted">
            {rows.length} shown · {totalMb.toFixed(1)} MB total · {" "}
            uploads go to Firebase Storage, references are deduplicated by SHA-256
          </p>
        </div>
        <div className="head-side">
          <AssetUploader defaultKind="bottle" setAsBottle={false} />
        </div>
      </header>

      <nav className="chips">
        <Link href="/assets" className={!kindFilter ? "active" : undefined}>All</Link>
        {["bottle", "map", "logo", "photo", "document", "other"].map((k) => (
          <Link
            key={k}
            href={`/assets?kind=${k}`}
            className={kindFilter === k ? "active" : undefined}
          >
            {k}
          </Link>
        ))}
      </nav>

      <section className="asset-grid">
        {rows.map((a) => {
          const resLow =
            a.width_px !== null && a.width_px < 800;
          return (
            <article key={a.id} className="asset-tile">
              <Link href={`/catalog-admin/api/assets/${a.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/catalog-admin/api/assets/${a.id}`} alt={a.file_name ?? ""} loading="lazy" />
              </Link>
              <div className="asset-tile__meta small">
                <div className="muted">
                  {a.kind} · {fmtBytes(a.bytes)}
                  {a.width_px && a.height_px && ` · ${a.width_px}×${a.height_px}`}
                </div>
                {a.bottle_vintage_id ? (
                  <Link href={`/wines/${a.bottle_vintage_id}`} className="strong">
                    {a.wine_display_name}
                    {a.wine_vintage_text ? ` ${a.wine_vintage_text}` : ""}
                  </Link>
                ) : (
                  <span className="muted">
                    {a.used_count > 0 ? `Linked to ${a.used_count} wine${a.used_count === 1 ? "" : "s"}` : "Not used"}
                  </span>
                )}
                {resLow && <div className="warn-text small">Low resolution</div>}
              </div>
            </article>
          );
        })}
        {rows.length === 0 && (
          <p className="muted">No assets uploaded yet.</p>
        )}
      </section>
    </>
  );
}
