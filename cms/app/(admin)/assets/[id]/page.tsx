import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import AssetEditForm, { type AssetMeta } from "@/components/AssetEditForm";
import AssetDeleteButton from "@/components/AssetDeleteButton";
import AssetReplaceUploader from "@/components/AssetReplaceUploader";
import AssetAltTextButton from "@/components/AssetAltTextButton";
import CopyButton from "@/components/CopyButton";
import UpdatedMeta from "@/components/UpdatedMeta";

export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  kind: string;
  derivative: string;
  file_name: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  bytes: number;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  storage_path: string;
  created_at: Date;
  uploaded_by_email: string | null;
};

type UsageRow = {
  vintage_id: string;
  display_name: string;
  vintage_text: string | null;
  producer_name: string | null;
  role: string;
  is_primary_bottle: boolean;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const assetMaybe = await one<AssetRow>(
    `SELECT a.id, a.kind, a.derivative, a.file_name, a.mime_type, a.width_px, a.height_px,
            a.bytes, a.checksum_sha256, a.metadata, a.storage_path, a.created_at,
            u.email AS uploaded_by_email
       FROM assets a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
  );
  if (!assetMaybe) notFound();
  const asset: AssetRow = assetMaybe;

  const usage = await query<UsageRow>(
    `SELECT v.id AS vintage_id, w.display_name, v.vintage_text,
            p.name AS producer_name, wa.role,
            (v.bottle_asset_id = $1) AS is_primary_bottle
       FROM wine_assets wa
       JOIN wine_vintages v ON v.id = wa.wine_vintage_id
       JOIN wines w ON w.id = v.wine_id
       LEFT JOIN producers p ON p.id = w.producer_id
       WHERE wa.asset_id = $1
       ORDER BY p.name NULLS LAST, w.display_name`,
    [id],
  );

  // Also surface wines whose bottle_asset_id points here directly, in case
  // wine_assets lost its join row (defensive — the uploader keeps them in sync).
  const bottleOnly = await query<UsageRow>(
    `SELECT v.id AS vintage_id, w.display_name, v.vintage_text,
            p.name AS producer_name, 'bottle' AS role,
            true AS is_primary_bottle
       FROM wine_vintages v
       JOIN wines w ON w.id = v.wine_id
       LEFT JOIN producers p ON p.id = w.producer_id
       WHERE v.bottle_asset_id = $1
         AND NOT EXISTS (SELECT 1 FROM wine_assets wa WHERE wa.asset_id = $1 AND wa.wine_vintage_id = v.id)`,
    [id],
  );
  const allUsage = [...usage, ...bottleOnly];

  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const metaForForm: AssetMeta = {
    id: asset.id,
    kind: asset.kind,
    file_name: asset.file_name,
    alt_text: typeof meta.alt_text === "string" ? meta.alt_text : "",
    caption: typeof meta.caption === "string" ? meta.caption : "",
    credit_line: typeof meta.credit_line === "string" ? meta.credit_line : "",
    tags,
  };

  const resWarn = asset.width_px !== null && asset.width_px < 800;
  const canEdit = user.role === "admin" || user.role === "editor";

  return (
    <>
      <nav className="crumbs">
        <Link href="/assets">← Back to assets</Link>
      </nav>
      <header className="page-head row">
        <div>
          <h1>{asset.file_name || "Untitled asset"}</h1>
          <p className="muted">
            {asset.kind}
            {asset.derivative !== "original" && ` (${asset.derivative})`}
            {" · "}{fmtBytes(asset.bytes)}
            {asset.width_px && asset.height_px && ` · ${asset.width_px}×${asset.height_px}`}
            {asset.mime_type && ` · ${asset.mime_type}`}
          </p>
          <p className="small muted record-meta">
            <UpdatedMeta entityType="asset" entityId={id} fallback={asset.created_at} />
          </p>
        </div>
        <div className="head-side">
          {canEdit && <AssetReplaceUploader assetId={asset.id} />}
          {canEdit && <AssetDeleteButton id={asset.id} usedCount={allUsage.length} />}
        </div>
      </header>

      <div className="asset-detail">
        <div className="asset-detail__image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/catalog-admin/api/assets/${asset.id}`}
            alt={metaForForm.alt_text || asset.file_name || "Asset"}
          />
          {resWarn && (
            <p className="warn-text small">
              Low resolution ({asset.width_px}px wide) — print output may look soft.
            </p>
          )}
        </div>

        <div className="asset-detail__meta">
          <AssetEditForm asset={metaForForm} canEdit={canEdit} />
          {canEdit && (asset.kind === "bottle" || asset.kind === "map" || asset.kind === "photo" || asset.kind === "logo") && (
            <AssetAltTextButton assetId={asset.id} existing={metaForForm.alt_text} />
          )}

          <div className="panel">
            <div className="panel-head"><h2>Used by</h2></div>
            {allUsage.length === 0 ? (
              <p className="muted">Not used by any wine yet.</p>
            ) : (
              <ul className="plain-list">
                {allUsage.map((u) => (
                  <li key={`${u.vintage_id}-${u.role}`}>
                    <Link href={`/wines/${u.vintage_id}`} className="strong">
                      {u.producer_name ? `${u.producer_name} — ` : ""}
                      {u.display_name}
                      {u.vintage_text ? ` ${u.vintage_text}` : ""}
                    </Link>
                    <span className="muted small">
                      {" "}· {u.role}
                      {u.is_primary_bottle && u.role === "bottle" && " (primary)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Technical</h2></div>
            <dl className="kv">
              <dt>Asset ID</dt>
              <dd className="mono">
                {asset.id} <CopyButton compact value={asset.id} label="Copy ID" />
              </dd>
              <dt>Checksum</dt>
              <dd className="mono small">
                {asset.checksum_sha256 ?? "—"}
                {asset.checksum_sha256 && <> <CopyButton compact value={asset.checksum_sha256} label="Copy" /></>}
              </dd>
              <dt>Storage path</dt>
              <dd className="mono small">
                {asset.storage_path} <CopyButton compact value={asset.storage_path} label="Copy" />
              </dd>
              <dt>Uploaded</dt>
              <dd>
                {new Date(asset.created_at).toLocaleString()}
                {asset.uploaded_by_email ? ` by ${asset.uploaded_by_email}` : ""}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
