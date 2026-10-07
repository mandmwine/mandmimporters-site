"use client";
// Client component — one card in the AIProposalsPanel. Shows the proposed
// content, the sources Claude cited, and Accept / Reject / Edit buttons.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptProposal, rejectProposal } from "@/lib/ai-actions";

export type ProposalRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  field_name: string | null;
  output: { text: string; web_results?: { title: string; url: string }[] };
  model: string | null;
  created_at: Date;
};

// Try to parse the proposed output as JSON — some actions (scores, vintage
// details) return structured data that reads much better as a formatted summary
// than as raw JSON.
function PrettyBody({ row }: { row: ProposalRow }) {
  const text = row.output.text ?? "";
  if (row.action === "find_scores") {
    try {
      const payload = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as {
        scores?: Array<{ critic?: string; score?: string; year?: number; quote?: string; url?: string }>;
      };
      const scores = payload.scores ?? [];
      if (scores.length === 0) {
        return <p className="muted small">Claude did not find any critic scores for this wine on the public internet.</p>;
      }
      return (
        <ul className="plain-list small">
          {scores.map((s, i) => (
            <li key={i}>
              <strong>{s.critic}:</strong> {s.score}
              {s.year ? ` (${s.year})` : ""}
              {s.quote ? <> — <em>&ldquo;{s.quote}&rdquo;</em></> : null}
              {s.url && <> <a className="link small" href={s.url} target="_blank" rel="noreferrer">source ↗</a></>}
            </li>
          ))}
        </ul>
      );
    } catch {
      return <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>;
    }
  }
  if (row.action === "fill_vintage_details") {
    try {
      const payload = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as {
        aging?: string;
        special_designation?: string;
        mevushal?: string;
        grapes?: Array<{ name?: string; percentage?: number }>;
        confidence?: string;
        notes?: string;
      };
      const anyFilled =
        payload.aging || payload.special_designation || payload.mevushal ||
        (payload.grapes && payload.grapes.length > 0);
      if (!anyFilled) {
        return <p className="muted small">Claude did not find anything verifiable for this wine.</p>;
      }
      return (
        <dl className="specs small">
          {payload.aging && <div><dt>Aging</dt><dd>{payload.aging}</dd></div>}
          {payload.special_designation && <div><dt>Designation</dt><dd>{payload.special_designation}</dd></div>}
          {payload.mevushal && <div><dt>Mevushal</dt><dd>{payload.mevushal}</dd></div>}
          {payload.grapes && payload.grapes.length > 0 && (
            <div>
              <dt>Grapes</dt>
              <dd>
                {payload.grapes.map((g, i) => (
                  <span key={i}>
                    {g.percentage ? `${Math.round(g.percentage)}% ` : ""}{g.name}
                    {i < (payload.grapes?.length ?? 0) - 1 ? ", " : ""}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {payload.confidence && <div><dt>Confidence</dt><dd>{payload.confidence}</dd></div>}
          {payload.notes && <div><dt>Notes</dt><dd className="muted">{payload.notes}</dd></div>}
        </dl>
      );
    } catch {
      return <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>;
    }
  }
  // Plain-text proposals (tasting note, bio, condense, rewrite).
  return <p style={{ margin: 0 }}>{text}</p>;
}

export default function AIProposalReviewer({ row, label }: { row: ProposalRow; label: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);
  const router = useRouter();

  if (done) {
    return (
      <div className="ai-proposal-card ai-proposal-card--done">
        <span className="muted small">
          {label} {done === "accepted" ? "— applied ✓" : "— rejected"}
        </span>
      </div>
    );
  }

  function accept() {
    const fd = new FormData();
    fd.set("id", row.id);
    start(async () => {
      await acceptProposal(fd);
      setDone("accepted");
      router.refresh();
    });
  }
  function reject() {
    const fd = new FormData();
    fd.set("id", row.id);
    start(async () => {
      await rejectProposal(fd);
      setDone("rejected");
      router.refresh();
    });
  }

  return (
    <div className="ai-proposal-card">
      <header className="ai-proposal-card__head">
        <strong>{label}</strong>
        <span className="muted small">
          {row.entity_type === "producer" ? "producer field" : row.field_name?.replace(/_/g, " ")}
          {row.model ? ` · ${row.model.replace("claude-", "")}` : ""}
        </span>
      </header>
      <div className="ai-proposal-card__body">
        <PrettyBody row={row} />
      </div>
      {row.output.web_results && row.output.web_results.length > 0 && (
        <details className="ai-proposal-card__sources">
          <summary className="small">{row.output.web_results.length} source{row.output.web_results.length === 1 ? "" : "s"}</summary>
          <ul className="plain-list small">
            {row.output.web_results.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="ai-proposal-card__actions">
        <button className="btn primary small" type="button" disabled={pending} onClick={accept}>
          {pending ? "Applying…" : "Accept"}
        </button>
        <button className="link small muted" type="button" disabled={pending} onClick={reject}>
          Reject
        </button>
      </div>
    </div>
  );
}
