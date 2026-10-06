import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import AssetUploader from "@/components/AssetUploader";
import AssetGrid, { type AssetTile } from "@/components/AssetGrid";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: string;
  file_name: string | null;
  width_px: number | null;
  height_px: number | null;
  bytes: number;
  used_count: number;
  bottle_vintage_id: string | null;
  wine_display_name: string | null;
  wine_vintage_text: string | null;
  metadata: Record<string, unknown> | null;
};

type SP = { kind?: string; q?: string; filter?: string };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const kindFilter = sp.kind ?? "";
  const q = (sp.q ?? "").trim();
  const filter = sp.filter ?? ""; // "" | "unused" | "linked" | "lowres"
  const canEdit = user.role === "admin" || user.role === "editor";

  const where: string[] = ["a.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (kindFilter) {
    params.push(kindFilter);
    where.push(`a.kind = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(lower(coalesce(a.file_name, '')) LIKE $${params.length}
        OR lower(coalesce(a.metadata->>'alt_text', '')) LIKE $${params.length}
        OR lower(coalesce(a.metadata->>'caption', '')) LIKE $${params.length}
        OR lower(coalesce(a.metadata->>'credit_line', '')) LIKE $${params.length})`,
    );
  }
  if (filter === "unused") {
    where.push(
      `NOT EXISTS (SELECT 1 FROM wine_assets wa WHERE wa.asset_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM wine_vintages v WHERE v.bottle_asset_id = a.id)`,
    );
  }
  if (filter === "linked") {
    where.push(
      `(EXISTS (SELECT 1 FROM wine_assets wa WHERE wa.asset_id = a.id)
         OR EXISTS (SELECT 1 FROM wine_vintages v WHERE v.bottle_asset_id = a.id))`,
    );
  }
  if (filter === "lowres") {
    where.push("a.width_px IS NOT NULL AND a.width_px < 800");
  }

  const rows = await query<Row>(
    `SELECT a.id, a.kind, a.file_name, a.width_px, a.height_px, a.bytes, a.metadata,
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

  const [{ total_bytes }] = await query<{ total_bytes: string }>(
    "SELECT coalesce(sum(bytes), 0)::text AS total_bytes FROM assets WHERE deleted_at IS NULL",
  );
  const totalMb = Number(total_bytes) / 1024 / 1024;
  const [{ unused }] = await query<{ unused: number }>(
    `SELECT count(*)::int AS unused FROM assets a
       WHERE a.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM wine_assets wa WHERE wa.asset_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM wine_vintages v WHERE v.bottle_asset_id = a.id)`,
  );

  const tiles: AssetTile[] = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      kind: r.kind,
      file_name: r.file_name,
      width_px: r.width_px,
      height_px: r.height_px,
      bytes: Number(r.bytes),
      used_count: r.used_count,
      bottle_vintage_id: r.bottle_vintage_id,
      wine_display_name: r.wine_display_name,
      wine_vintage_text: r.wine_vintage_text,
      alt_text: typeof meta.alt_text === "string" ? meta.alt_text : "",
    };
  });

  // Build filter chip hrefs that preserve the other params.
  const kindHref = (k: string) => {
    const u = new URLSearchParams();
    if (k) u.set("kind", k);
    if (q) u.set("q", q);
    if (filter) u.set("filter", filter);
    const s = u.toString();
    return `/assets${s ? `?${s}` : ""}`;
  };
  const filterHref = (f: string) => {
    const u = new URLSearchParams();
    if (kindFilter) u.set("kind", kindFilter);
    if (q) u.set("q", q);
    if (f) u.set("filter", f);
    const s = u.toString();
    return `/assets${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Assets</h1>
          <p className="muted">
            {rows.length} shown · {totalMb.toFixed(1)} MB total ·{" "}
            {unused > 0 ? (
              <Link href={filterHref("unused")}>{unused} unused</Link>
            ) : (
              "nothing unused"
            )}{" "}
            · dedup by SHA-256
          </p>
        </div>
        <div className="head-side">
          {canEdit && <AssetUploader defaultKind="bottle" setAsBottle={false} />}
        </div>
      </header>

      <form className="asset-search" action="/assets">
        {/* Preserve current filter state when submitting the search box. */}
        {kindFilter && <input type="hidden" name="kind" value={kindFilter} />}
        {filter && <input type="hidden" name="filter" value={filter} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search file name, alt text, caption, credit…"
        />
        <button className="btn small" type="submit">Search</button>
        {q && <Link className="link small" href={filterHref(filter)}>Clear</Link>}
      </form>

      <nav className="chips">
        <Link href={kindHref("")} className={!kindFilter ? "active" : undefined}>All kinds</Link>
        {["bottle", "map", "logo", "photo", "document", "other"].map((k) => (
          <Link key={k} href={kindHref(k)} className={kindFilter === k ? "active" : undefined}>
            {k}
          </Link>
        ))}
      </nav>
      <nav className="chips">
        <Link href={filterHref("")} className={!filter ? "active" : undefined}>Any usage</Link>
        <Link href={filterHref("linked")} className={filter === "linked" ? "active" : undefined}>Linked</Link>
        <Link href={filterHref("unused")} className={filter === "unused" ? "active" : undefined}>Unused</Link>
        <Link href={filterHref("lowres")} className={filter === "lowres" ? "active" : undefined}>Low resolution</Link>
      </nav>

      <AssetGrid tiles={tiles} canEdit={canEdit} />
    </>
  );
}
