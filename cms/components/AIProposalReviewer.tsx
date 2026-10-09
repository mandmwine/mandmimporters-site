"use client";
// Client component — one card in the AIProposalsPanel. Shows the proposed
// content, the sources Claude cited, and Accept / Reject / Edit buttons.
//
// Phase 46 — factual proposals (critic scores, vintage details) require
// a source before Accept. The card surfaces a "Attach a source" picker
// listing the proposal's web_results; selecting one calls
// setProposalSource server-side, which clears the gate.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptProposal, rejectProposal, setProposalSource } from "@/lib/ai-actions";

export type ProposalRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  field_name: string | null;
  output: { text: string; web_results?: { title: string; url: string }[] };
  model: string | null;
  created_at: Date;
  // Phase 46 — proposal_type + source_id come through so the UI can
  // decide whether to show the source gate. Optional on existing API
  // callers so pages that haven't been updated yet still compile.
  proposal_type?: "fact" | "copy" | null;
  source_id?: string | null;
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
  const [error, setError] = useState<string | null>(null);
  // Phase 46 — track whether a source has been attached in this session so
  // the UI updates between the Attach click and the Accept click without
  // waiting for a full router.refresh.
  const [attachedSource, setAttachedSource] = useState<string | null>(row.source_id ?? null);
  const router = useRouter();

  // Phase 46 — a factual proposal with no attached source blocks Accept.
  const isFact = row.proposal_type === "fact";
  const sourceAttached = Boolean(attachedSource);
  const sourceGate = isFact && !sourceAttached;
  const webResults = row.output.web_results ?? [];

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
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    start(async () => {
      const res = await acceptProposal(fd);
      if (res && !res.ok) {
        setError(res.message ?? "Could not accept.");
        return;
      }
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
  function attachSource(url: string, title: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("url", url);
    fd.set("title", title);
    start(async () => {
      const res = await setProposalSource(fd);
      if (!res.ok) {
        setError(res.message ?? "Could not attach source.");
        return;
      }
      setAttachedSource(url);
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

      {/* Phase 46 — factual-proposal source gate. For a fact proposal
          with no source yet, Accept is disabled and the reviewer must
          first pick one of the proposal's web_results (or paste a
          custom URL) as the backing source. Copy proposals skip this. */}
      {isFact && (
        <div className={`ai-proposal-source ${sourceAttached ? "ai-proposal-source--ok" : "ai-proposal-source--needed"}`}>
          {sourceAttached ? (
            <p className="small">
              <strong>Source attached:</strong>{" "}
              <a href={attachedSource!} target="_blank" rel="noreferrer">{attachedSource}</a>
            </p>
          ) : (
            <>
              <p className="small">
                <strong>Attach a source.</strong> This is a factual claim; one of
                the following should back it before Accept.
              </p>
              {webResults.length === 0 ? (
                <AttachCustomSource onAttach={attachSource} pending={pending} />
              ) : (
                <ul className="plain-list small ai-proposal-source__list">
                  {webResults.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="link small"
                        disabled={pending}
                        onClick={() => attachSource(r.url, r.title || r.url)}
                        title={r.url}
                      >
                        Attach: {r.title || r.url}
                      </button>
                    </li>
                  ))}
                  <li>
                    <AttachCustomSource onAttach={attachSource} pending={pending} />
                  </li>
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="ai-proposal-card__actions">
        <button
          className="btn primary small"
          type="button"
          disabled={pending || sourceGate}
          onClick={accept}
          title={sourceGate ? "Attach a source first" : undefined}
        >
          {pending ? "Applying…" : "Accept"}
        </button>
        <button className="link small muted" type="button" disabled={pending} onClick={reject}>
          Reject
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

// Phase 46 — small inline form for pasting a custom URL when Claude's
// web_results didn't include the right source (or when there were none).
function AttachCustomSource({ onAttach, pending }: { onAttach: (url: string, title: string) => void; pending: boolean }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="link small" onClick={() => setOpen(true)} disabled={pending}>
        + Attach a custom URL
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--rule)", borderRadius: 3, minWidth: 240 }}
      />
      <button
        type="button"
        className="btn small"
        onClick={() => url && onAttach(url, url)}
        disabled={pending || !url}
      >
        Attach
      </button>
      <button type="button" className="link small muted" onClick={() => { setOpen(false); setUrl(""); }}>
        Cancel
      </button>
    </span>
  );
}
