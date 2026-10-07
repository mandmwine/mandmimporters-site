// Public (unauthenticated) read-only view of a single wine. Keyed by the
// wine's website_slug so the QR codes on trade sheets remain stable even if
// the vintage changes. We serve the current (most recent, non-draft) vintage.
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { loadSheetData } from "@/lib/sheet/data";
import { SingleWineSheet } from "@/lib/sheet/SingleWineSheet";
import "@/lib/sheet/sheet.css";

export const dynamic = "force-dynamic";

export default async function PublicWineShare({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) notFound();

  // Pick the latest non-discontinued vintage for this slug.
  const row = await one<{ id: string }>(
    `SELECT v.id FROM wine_vintages v
       JOIN wines w ON w.id = v.wine_id
       WHERE w.website_slug = $1
         AND v.deleted_at IS NULL
         AND v.status NOT IN ('discontinued', 'draft')
       ORDER BY v.vintage_text DESC NULLS LAST
       LIMIT 1`,
    [slug],
  );
  if (!row) notFound();
  const data = await loadSheetData(row.id);
  if (!data) notFound();

  return (
    <main className="share-wine">
      <SingleWineSheet data={data} mode="screen" />
      <footer className="share-wine__footer small muted">
        <span>M&amp;M Importers · {data.wine.producer}</span>
        <a
          href={`https://www.mandmimporters.com/wines/p/${slug}`}
          target="_blank"
          rel="noreferrer"
        >
          mandmimporters.com ↗
        </a>
      </footer>
    </main>
  );
}
