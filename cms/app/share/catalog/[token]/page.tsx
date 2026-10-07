// Public (unauthenticated) read-only view of a catalog. Access is granted by
// the opaque share token in the URL — anyone with the token sees the catalog
// as a reader would, but cannot edit, approve or export anything.
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import { buildCatalogPlan } from "@/lib/sheet/catalog-html";
import { SingleWineSheet } from "@/lib/sheet/SingleWineSheet";
import "@/lib/sheet/sheet.css";

export const dynamic = "force-dynamic";

type Share = {
  id: string;
  catalog_id: string;
  revoked_at: Date | null;
  expires_at: Date | null;
};

export default async function PublicCatalogShare({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();

  const share = await one<Share>(
    `SELECT id, catalog_id, revoked_at, expires_at
       FROM catalog_shares WHERE token = $1`,
    [token],
  );
  if (!share) notFound();
  if (share.revoked_at) {
    return <RevokedPage />;
  }
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return <RevokedPage expired />;
  }

  await query(
    "UPDATE catalog_shares SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1",
    [share.id],
  );

  const plan = await buildCatalogPlan(share.catalog_id);
  if (!plan) notFound();

  // Group items by section (sections in position order; items within each
  // section in position order).
  const itemsBySection = new Map<string | null, typeof plan.items>();
  for (const it of plan.items) {
    const key = it.section_id ?? null;
    const list = itemsBySection.get(key) ?? [];
    list.push(it);
    itemsBySection.set(key, list);
  }

  const sheetSections = plan.sections.filter((s) =>
    ["wines", "producer_intro", "divider", "regional_index"].includes(s.kind),
  );

  return (
    <article className="catalog-read">
      <header className="catalog-read__header">
        <p className="eyebrow">M &amp; M Importers · Catalog</p>
        <h1>{plan.catalog.name}</h1>
        {plan.catalog.season && <p className="muted">{plan.catalog.season}</p>}
      </header>

      <div className="catalog-read__sections">
        {sheetSections.map((section) => {
          const items = itemsBySection.get(section.id) ?? [];
          const wines = items
            .map((it) => plan.wineDataById.get(it.wine_vintage_id))
            .filter((d): d is NonNullable<typeof d> => Boolean(d));

          return (
            <section key={section.id} className="catalog-read__section">
              {section.title && (
                <h2 className="catalog-read__section-title">{section.title}</h2>
              )}
              <div className="catalog-read__wines">
                {wines.map((d) => (
                  <div key={d.wine.id} className="catalog-read__wine">
                    <SingleWineSheet data={d} mode="screen" />
                  </div>
                ))}
                {wines.length === 0 && (
                  <p className="muted small">No wines in this section yet.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="catalog-read__footer small muted">
        Shared read-only view · M&amp;M Importers
      </footer>
    </article>
  );
}

function RevokedPage({ expired = false }: { expired?: boolean }) {
  return (
    <main className="share-revoked">
      <h1>{expired ? "This link has expired." : "This link is no longer active."}</h1>
      <p className="muted">
        Please reach out to M&amp;M Importers for an updated link.
      </p>
    </main>
  );
}
