// Phase 37 (Sprint 2) — Global AI inbox (final decisions §7).
//
// Lists every ai_actions row with status='proposed' across every wine
// and every producer, so an admin can clear the backlog in one sitting
// instead of hunting through each record. Mirrors the per-record
// AIProposalsPanel's visual shape but adds the entity label to each
// card so the reviewer always knows what they're approving.
//
// Admin/editor only. Nothing writes to live records until the user
// clicks Accept on an individual card (same guarantee as the per-record
// panel).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import AIProposalReviewer, { type ProposalRow } from "@/components/AIProposalReviewer";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  tasting_note: "Draft tasting note",
  condense: "Condensed copy",
  rewrite_voice: "Rewritten copy",
  find_scores: "Critic scores",
  fill_vintage_details: "Technical details",
  producer_bio: "Producer bio",
  asset_alt_text: "Image description",
};

type Row = ProposalRow & {
  entity_label: string | null;
  entity_href: string | null;
};

type FilterKey = "all" | "wine_vintage" | "producer" | "asset";

export default async function AIInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin" && user.role !== "editor") notFound();
  const sp = await searchParams;
  const filter: FilterKey =
    sp.filter === "wine_vintage" || sp.filter === "producer" || sp.filter === "asset" ? sp.filter : "all";

  const where = ["a.status = 'proposed'"];
  if (filter !== "all") where.push(`a.entity_type = '${filter}'`);

  // Pulls proposals plus a one-line "entity label" so the inbox card
  // headline reads naturally ("Vallepicciola Chianti 2021 - Tasting
  // note") without the user having to click through to check.
  const rows = await query<Row>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.field_name,
            a.output, a.model, a.created_at,
            a.proposal_type, a.source_id,
            CASE a.entity_type
              WHEN 'wine_vintage' THEN (
                SELECT w.display_name || CASE WHEN v.vintage_text IS NOT NULL THEN ' ' || v.vintage_text ELSE '' END
                  FROM wine_vintages v JOIN wines w ON w.id = v.wine_id
                  WHERE v.id = a.entity_id)
              WHEN 'producer' THEN (
                SELECT name FROM producers WHERE id = a.entity_id)
              WHEN 'asset' THEN (
                SELECT COALESCE(file_name, 'asset ' || substr(a.entity_id::text, 1, 8))
                  FROM assets WHERE id = a.entity_id)
              ELSE a.entity_type || ' ' || substr(a.entity_id::text, 1, 8)
            END AS entity_label,
            CASE a.entity_type
              WHEN 'wine_vintage' THEN '/wines/' || a.entity_id
              WHEN 'producer' THEN '/producers/' || a.entity_id
              WHEN 'asset' THEN '/assets/' || a.entity_id
              ELSE NULL
            END AS entity_href
       FROM ai_actions a
      WHERE ${where.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT 200`,
  );

  const counts = await query<{ entity_type: string; n: number }>(
    "SELECT entity_type, count(*)::int AS n FROM ai_actions WHERE status = 'proposed' GROUP BY entity_type",
  );
  const total = counts.reduce((a, c) => a + c.n, 0);

  return (
    <>
      <p className="crumbs">
        <Link href="/review">Review</Link> / AI proposals
      </p>
      <header className="page-head">
        <h1>AI inbox <span className="muted">{total}</span></h1>
        <p className="muted">
          Every suggestion Claude has made that&rsquo;s still waiting on a human.
          Nothing goes live until you click Accept.
        </p>
      </header>

      <nav className="chips">
        <Link href="/review/ai" className={filter === "all" ? "active" : undefined}>
          All <span className="muted">{total}</span>
        </Link>
        {counts.map((c) => (
          <Link
            key={c.entity_type}
            href={`/review/ai?filter=${c.entity_type}`}
            className={filter === c.entity_type ? "active" : undefined}
          >
            {entityLabel(c.entity_type)} <span className="muted">{c.n}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="panel">
          <p className="muted">
            Nothing waiting for review. New proposals land here whenever
            Claude is asked to find scores, fill details, draft notes or
            describe images.
          </p>
        </div>
      ) : (
        <ul className="plain-list ai-inbox">
          {rows.map((r) => (
            <li key={r.id} className="panel ai-inbox__item">
              <div className="ai-inbox__head">
                <div>
                  <strong>{ACTION_LABEL[r.action] ?? r.action}</strong>
                  <span className="muted small">
                    {" "}&middot; {entityLabel(r.entity_type)} &middot;{" "}
                    {new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  </span>
                </div>
                {r.entity_href && (
                  <Link className="link small" href={r.entity_href}>
                    Open {r.entity_label ?? "record"} &rarr;
                  </Link>
                )}
              </div>
              {r.entity_label && (
                <div className="ai-inbox__entity">{r.entity_label}</div>
              )}
              <AIProposalReviewer row={r} label={ACTION_LABEL[r.action] ?? r.action} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function entityLabel(kind: string): string {
  if (kind === "wine_vintage") return "Wines";
  if (kind === "producer") return "Producers";
  if (kind === "asset") return "Images";
  return kind;
}
