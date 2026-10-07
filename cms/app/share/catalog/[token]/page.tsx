// Public (unauthenticated) read-only view of a catalog. Access is granted by
// the opaque share token in the URL — anyone with the token sees the catalog
// as a reader would, but cannot edit, approve or export anything.
//
// Phase 16: if the share has a password_hash, viewing is gated by an unlock
// cookie; the viewer enters the passphrase once per browser via
// /share/catalog/<token>/unlock. The viewer can also download a PDF via
// /share/catalog/<token>/pdf once unlocked.
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { one, query } from "@/lib/db";
import { buildCatalogPlan } from "@/lib/sheet/catalog-html";
import { SingleWineSheet } from "@/lib/sheet/SingleWineSheet";
import { unlockCookieName, unlockCookieValue } from "@/lib/sharePassword";
import UnlockShareForm from "@/components/UnlockShareForm";
import "@/lib/sheet/sheet.css";

export const dynamic = "force-dynamic";

type Share = {
  id: string;
  catalog_id: string;
  revoked_at: Date | null;
  expires_at: Date | null;
  password_hash: string | null;
  recipient_name: string | null;
};

export default async function PublicCatalogShare({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();

  const share = await one<Share>(
    `SELECT id, catalog_id, revoked_at, expires_at, password_hash, recipient_name
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

  // Password gate: the viewer must have an unlock cookie whose value matches
  // the current password_hash. A rotated password invalidates every stale
  // cookie, so a revoked recipient can't come back with yesterday's unlock.
  if (share.password_hash) {
    const cookieStore = await cookies();
    const expected = unlockCookieValue(token, share.password_hash);
    const got = cookieStore.get(unlockCookieName(token))?.value ?? "";
    if (got !== expected) {
      return (
        <UnlockGate
          token={token}
          error={sp.error === "wrong" ? "That passphrase did not match. Try again." : null}
          recipient={share.recipient_name}
        />
      );
    }
  }

  await query(
    "UPDATE catalog_shares SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1",
    [share.id],
  );

  const plan = await buildCatalogPlan(share.catalog_id);
  if (!plan) notFound();

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
        <p className="small">
          <a className="btn primary small" href={`/catalog-admin/share/catalog/${token}/pdf?preset=email`}>
            Download PDF
          </a>
          <span className="muted small" style={{ marginLeft: 10 }}>
            Rendered on the fly — up to a minute for a long catalog.
          </span>
        </p>
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
        Shared read-only view · M&amp;M Importers · <Link href={`/share/catalog/${token}`}>Refresh</Link>
      </footer>
    </article>
  );
}

function UnlockGate({ token, error, recipient }: { token: string; error: string | null; recipient: string | null }) {
  return (
    <main className="share-gate">
      <div className="share-gate__card">
        <p className="eyebrow">M &amp; M Importers</p>
        <h1>Enter the passphrase</h1>
        {recipient && <p className="muted small">For {recipient}.</p>}
        <p className="muted">The sender shared this catalog with you under a passphrase.</p>
        <UnlockShareForm token={token} />
        {error && <p className="error small">{error}</p>}
      </div>
    </main>
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
