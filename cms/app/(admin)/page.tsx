import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Counts = {
  wines: number; producers: number; vintages: number;
  needs_review: number; approved: number; published: number;
  no_vintage: number; no_mevushal: number; no_supervision: number;
  open_flags: number; conflicts: number; needs_map: number;
  no_bottle: number; unused_assets: number; lowres_assets: number;
};

export default async function Dashboard() {
  const [c] = await query<Counts>(`
    SELECT
      (SELECT count(*) FROM wines WHERE deleted_at IS NULL)::int AS wines,
      (SELECT count(*) FROM producers WHERE deleted_at IS NULL)::int AS producers,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL)::int AS vintages,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND status IN ('draft','needs_review'))::int AS needs_review,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND status = 'approved')::int AS approved,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND status = 'published')::int AS published,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND vintage_text IS NULL)::int AS no_vintage,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND mevushal = 'unknown')::int AS no_mevushal,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND coalesce(supervision_display,'') = '')::int AS no_supervision,
      (SELECT count(*) FROM review_flags WHERE status = 'open')::int AS open_flags,
      (SELECT count(*) FROM review_flags WHERE status = 'open' AND flag_type IN ('conflict','duplicate'))::int AS conflicts,
      (SELECT count(*) FROM locations WHERE map_status <> 'approved')::int AS needs_map,
      (SELECT count(*) FROM wine_vintages WHERE deleted_at IS NULL AND bottle_asset_id IS NULL)::int AS no_bottle,
      (SELECT count(*) FROM assets a
         WHERE a.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM wine_assets wa WHERE wa.asset_id = a.id)
           AND NOT EXISTS (SELECT 1 FROM wine_vintages v WHERE v.bottle_asset_id = a.id))::int AS unused_assets,
      (SELECT count(*) FROM assets WHERE deleted_at IS NULL AND width_px IS NOT NULL AND width_px < 800)::int AS lowres_assets
  `);
  const byType = await query<{ flag_type: string; n: number }>(
    "SELECT flag_type, count(*)::int AS n FROM review_flags WHERE status = 'open' GROUP BY 1 ORDER BY 2 DESC",
  );
  const recent = await query<{ action: string; created_at: Date; email: string | null }>(
    `SELECT a.action, a.created_at, u.email FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 8`,
  );

  const cards: { label: string; value: number; href: string; tone?: string }[] = [
    { label: "Wine records needing review", value: c.needs_review, href: "/wines?status=needs_review", tone: "warn" },
    { label: "Source conflicts & duplicates", value: c.conflicts, href: "/review?type=conflict", tone: "warn" },
    { label: "Vintage missing", value: c.no_vintage, href: "/wines?missing=vintage", tone: "warn" },
    { label: "Mevushal not recorded", value: c.no_mevushal, href: "/wines?missing=mevushal" },
    { label: "Supervision not recorded", value: c.no_supervision, href: "/wines?missing=supervision" },
    { label: "Locations without an approved map", value: c.needs_map, href: "/maps?status=needs_map" },
    { label: "Wines without a bottle image", value: c.no_bottle, href: "/wines?missing=bottle", tone: c.no_bottle > 0 ? "warn" : undefined },
    { label: "Unused assets", value: c.unused_assets, href: "/assets?filter=unused" },
    { label: "Low-resolution assets", value: c.lowres_assets, href: "/assets?filter=lowres", tone: c.lowres_assets > 0 ? "warn" : undefined },
  ];

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">
          {c.wines} wines from {c.producers} producers · {c.vintages} vintage records · {c.approved} approved ·{" "}
          {c.published} published
        </p>
      </header>

      <section className="cards">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className={`card ${card.tone ?? ""}`}>
            <span className="num">{card.value}</span>
            <span>{card.label}</span>
          </Link>
        ))}
      </section>

      <section className="split">
        <div className="panel">
          <h2>Open review items</h2>
          {byType.length === 0 ? (
            <p className="muted">Nothing open.</p>
          ) : (
            <table className="table compact">
              <tbody>
                {byType.map((r) => (
                  <tr key={r.flag_type}>
                    <td>
                      <Link href={`/review?type=${r.flag_type}`}>{r.flag_type.replace(/_/g, " ")}</Link>
                    </td>
                    <td className="right">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>Recent activity</h2>
          {recent.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <ul className="activity">
              {recent.map((r, i) => (
                <li key={i}>
                  <span>{r.action.replace(/[._]/g, " ")}</span>
                  <span className="muted small">
                    {r.email ?? "system"} · {new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
