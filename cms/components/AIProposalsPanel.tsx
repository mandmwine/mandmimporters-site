// Server component — lists every ai_actions row with status='proposed' that
// targets this wine vintage OR its producer, so an editor can review and
// approve them one at a time without hunting through the UI.
import { query } from "@/lib/db";
import AIProposalReviewer, { type ProposalRow } from "./AIProposalReviewer";

type Props = {
  wineVintageId: string;
  producerId: string;
};

const ACTION_LABEL: Record<string, string> = {
  tasting_note: "Draft tasting note",
  condense: "Condensed copy",
  rewrite_voice: "Rewritten copy",
  find_scores: "Critic scores",
  fill_vintage_details: "Technical details (aging / grapes / mevushal / designation)",
  producer_bio: "Producer bio",
};

export default async function AIProposalsPanel({ wineVintageId, producerId }: Props) {
  const rows = await query<ProposalRow>(
    `SELECT id, action, entity_type, entity_id, field_name,
            output, model, created_at,
            proposal_type, source_id
     FROM ai_actions
     WHERE status = 'proposed'
       AND ((entity_type = 'wine_vintage' AND entity_id = $1)
         OR (entity_type = 'producer'     AND entity_id = $2))
     ORDER BY created_at DESC`,
    [wineVintageId, producerId],
  );
  if (rows.length === 0) return null;

  return (
    <div className="panel ai-proposals">
      <div className="panel-head">
        <h2>✦ Review AI proposals <span className="pill">{rows.length}</span></h2>
        <span className="muted small">Approve or reject each one. Nothing goes live until you accept it.</span>
      </div>
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={r.id}>
            <AIProposalReviewer row={r} label={ACTION_LABEL[r.action] ?? r.action} />
          </li>
        ))}
      </ul>
    </div>
  );
}
