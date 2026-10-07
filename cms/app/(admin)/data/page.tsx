import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { query } from "@/lib/db";
import BackfillBottleButton from "@/components/BackfillBottleButton";

export const dynamic = "force-dynamic";

export default async function DataHub() {
  await requireEditor();
  const [stats] = await query<{ total: number; with_sku: number; with_stock: number; with_price: number; with_bottle: number; legacy_only: number }>(
    `SELECT
       (SELECT count(*)::int FROM wine_vintages WHERE deleted_at IS NULL) AS total,
       (SELECT count(*)::int FROM wine_vintages WHERE deleted_at IS NULL AND sku IS NOT NULL) AS with_sku,
       (SELECT count(*)::int FROM wine_vintages WHERE deleted_at IS NULL AND stock_cases_available IS NOT NULL) AS with_stock,
       (SELECT count(DISTINCT vintage_id)::int FROM wine_vintage_prices) AS with_price,
       (SELECT count(*)::int FROM wine_vintages WHERE deleted_at IS NULL AND bottle_asset_id IS NOT NULL) AS with_bottle,
       (SELECT count(*)::int FROM wine_vintages
          WHERE deleted_at IS NULL AND bottle_asset_id IS NULL AND legacy->>'img' IS NOT NULL) AS legacy_only`,
  );

  return (
    <>
      <header className="page-head">
        <h1>Data</h1>
        <p className="muted">Bulk tools for inventory, prices, and asset backfill.</p>
      </header>

      <section className="cards">
        <div className="card">
          <span className="num">{stats.total}</span>
          <span>Total vintages</span>
        </div>
        <div className={`card ${stats.with_sku < stats.total ? "warn" : ""}`}>
          <span className="num">{stats.with_sku}</span>
          <span>With SKU · {stats.total - stats.with_sku} missing</span>
        </div>
        <div className={`card ${stats.with_stock < stats.total * 0.5 ? "warn" : ""}`}>
          <span className="num">{stats.with_stock}</span>
          <span>With stock cases</span>
        </div>
        <div className={`card ${stats.with_price === 0 ? "warn" : ""}`}>
          <span className="num">{stats.with_price}</span>
          <span>With pricing</span>
        </div>
        <div className={`card ${stats.with_bottle < stats.total * 0.5 ? "warn" : ""}`}>
          <span className="num">{stats.with_bottle}</span>
          <span>With bottle image</span>
        </div>
        <div className={`card ${stats.legacy_only > 0 ? "warn" : ""}`}>
          <span className="num">{stats.legacy_only}</span>
          <span>Legacy image only (not in library)</span>
        </div>
      </section>

      <section className="split wide" style={{ marginTop: 20 }}>
        <Link href="/data/import/inventory" className="panel data-link">
          <h2>Import inventory</h2>
          <p className="muted">
            Upload your monthly <strong>Inventory</strong> xlsx. Matches rows by SKU first,
            then by producer + wine + vintage. Updates stock cases on-hand / allocated / inbound.
          </p>
          <p className="small">Preview before writing. Nothing changes until you confirm.</p>
          <p className="link small">Open importer →</p>
        </Link>

        <Link href="/data/import/prices" className="panel data-link">
          <h2>Import prices</h2>
          <p className="muted">
            Upload your monthly <strong>Price Posting</strong> xlsx. Writes the full price ladder
            (FrontLine, 2cs, 3cs, 4cs, 5cs, 10cs, 25cs) per vintage.
          </p>
          <p className="small">Preview before writing. Nothing changes until you confirm.</p>
          <p className="link small">Open importer →</p>
        </Link>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Backfill bottle images from the public site</h2>
        <p className="small muted">
          Walks every vintage whose <code>legacy.img</code> is set but has no asset in our
          library, downloads it from mandmimporters.com, SHA-256-dedupes, uploads to Firebase
          Storage, and links it as the bottle image. One-click, idempotent (dedupe + skip
          already-set rows), ~2 min for 108 wines.
        </p>
        <p className="small">
          <strong>{stats.legacy_only}</strong> vintages are candidates right now.
        </p>
        <BackfillBottleButton disabled={stats.legacy_only === 0} />
      </section>
    </>
  );
}
