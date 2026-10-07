"use client";
import { useState, useTransition } from "react";
import { useEscClose } from "./useEscClose";
import { useRouter } from "next/navigation";
import {
  acceptProposal,
  proposeCondense,
  proposeFindScores,
  proposeRewriteVoice,
  proposeTastingNote,
  rejectProposal,
  type ProposeResult,
} from "@/lib/ai-actions";

type Action = "tasting_note" | "condense" | "rewrite_voice" | "find_scores";

// Sparkle button that appears next to editable fields. Click to open a chooser
// of actions available for that field.
export default function AIFieldButton({
  wineVintageId,
  field,
  actions,
  className = "ai-sparkle",
}: {
  wineVintageId: string;
  field: "tasting_note" | "food_pairing" | "short_description" | "wine_story" | "scores";
  actions: Action[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [proposal, setProposal] = useState<ProposeResult | null>(null);
  const [picked, setPicked] = useState<Action | null>(null);
  const router = useRouter();

  const closeDialog = () => { setOpen(false); setProposal(null); setPicked(null); };
  useEscClose(open, closeDialog);

  function run(action: Action) {
    setPicked(action);
    setProposal(null);
    start(async () => {
      const fd = new FormData();
      fd.set("wine_vintage_id", wineVintageId);
      fd.set("field", field);
      const result =
        action === "tasting_note" ? await proposeTastingNote(fd) :
        action === "condense"     ? await proposeCondense(fd)     :
        action === "rewrite_voice"? await proposeRewriteVoice(fd) :
        /* find_scores */           await proposeFindScores(fd);
      setProposal(result);
    });
  }

  function accept(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await acceptProposal(fd);
      router.refresh();
      setProposal(null);
      setPicked(null);
      setOpen(false);
    });
  }

  function reject(id: string, note?: string) {
    const fd = new FormData();
    fd.set("id", id);
    if (note) fd.set("note", note);
    start(async () => {
      await rejectProposal(fd);
      setProposal(null);
      setPicked(null);
    });
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="AI actions"
        onClick={() => setOpen(true)}
        title="AI actions"
      >
        ✦
      </button>
      {open && (
        <div className="ai-dialog" role="dialog">
          <div className="ai-dialog__inner">
            <header className="ai-dialog__head">
              <strong>AI assist</strong>
              <button type="button" className="link small muted" onClick={() => { setOpen(false); setProposal(null); setPicked(null); }}>
                Close
              </button>
            </header>

            {!picked && (
              <div className="ai-dialog__picker">
                {actions.includes("tasting_note") && (
                  <button className="ai-dialog__action" type="button" onClick={() => run("tasting_note")}>
                    <strong>Draft tasting note</strong>
                    <span className="muted small">From the wine's own data — producer, grape, region, aging.</span>
                  </button>
                )}
                {actions.includes("rewrite_voice") && (
                  <button className="ai-dialog__action" type="button" onClick={() => run("rewrite_voice")}>
                    <strong>Rewrite in catalog voice</strong>
                    <span className="muted small">Polish the current copy without losing any facts.</span>
                  </button>
                )}
                {actions.includes("condense") && (
                  <button className="ai-dialog__action" type="button" onClick={() => run("condense")}>
                    <strong>Condense for page</strong>
                    <span className="muted small">Shorten the current copy to around 70% of its length.</span>
                  </button>
                )}
                {actions.includes("find_scores") && (
                  <button className="ai-dialog__action" type="button" onClick={() => run("find_scores")}>
                    <strong>Find critic scores</strong>
                    <span className="muted small">Claude searches public critic sites and files findings for your review.</span>
                  </button>
                )}
              </div>
            )}

            {picked && pending && !proposal && (
              <div className="ai-dialog__loading">
                <span className="ai-dialog__spinner" />
                Thinking…
              </div>
            )}

            {proposal && !proposal.ok && (
              <div className="error">
                <p>{proposal.error}</p>
                <button className="btn small" type="button" onClick={() => { setProposal(null); setPicked(null); }}>Try again</button>
              </div>
            )}

            {proposal && proposal.ok && (
              <div className="ai-dialog__proposal">
                <p className="muted small">Claude proposes:</p>
                <div className="ai-dialog__text">
                  {field === "scores" ? (
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{proposal.proposedText}</pre>
                  ) : (
                    <p>{proposal.proposedText}</p>
                  )}
                </div>
                {proposal.webResults && proposal.webResults.length > 0 && (
                  <details className="ai-dialog__sources">
                    <summary>Sources</summary>
                    <ul>
                      {proposal.webResults.map((r, i) => (
                        <li key={i}>
                          <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="ai-dialog__actions">
                  <button className="btn primary small" type="button" disabled={pending} onClick={() => accept(proposal.id)}>
                    {pending ? "Applying…" : "Accept"}
                  </button>
                  <button className="link small muted" type="button" disabled={pending} onClick={() => reject(proposal.id)}>
                    Reject
                  </button>
                  <button className="link small" type="button" disabled={pending} onClick={() => run(picked!)}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="ai-dialog__backdrop" onClick={() => { setOpen(false); setProposal(null); setPicked(null); }} />
        </div>
      )}
    </>
  );
}
