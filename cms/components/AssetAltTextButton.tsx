"use client";
// Phase 16: one-click Claude alt-text generation for an asset.
// Claude Haiku looks at the image and proposes an alt-text; the editor
// accepts to merge it into assets.metadata.alt_text, rejects to drop it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptProposal,
  proposeAssetAltText,
  rejectProposal,
  type ProposeResult,
} from "@/lib/ai-actions";

export default function AssetAltTextButton({ assetId, existing }: { assetId: string; existing: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [proposal, setProposal] = useState<ProposeResult | null>(null);
  const router = useRouter();

  function run() {
    setProposal(null);
    start(async () => {
      const fd = new FormData();
      fd.set("asset_id", assetId);
      const r = await proposeAssetAltText(fd);
      setProposal(r);
    });
  }

  function accept(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await acceptProposal(fd);
      router.refresh();
      setProposal(null);
      setOpen(false);
    });
  }
  function reject(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await rejectProposal(fd);
      setProposal(null);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn small"
        onClick={() => { setOpen(true); run(); }}
        title={existing ? "Overwrite existing alt-text with a new Claude proposal" : "Ask Claude to look at the image and draft alt-text"}
      >
        ✦ {existing ? "Re-draft alt-text" : "Draft alt-text from image"}
      </button>
    );
  }
  return (
    <div className="ai-proposal-card" style={{ marginTop: 10 }}>
      <header className="ai-proposal-card__head">
        <strong>Claude alt-text</strong>
        <button type="button" className="link small muted" onClick={() => { setOpen(false); setProposal(null); }}>Close</button>
      </header>
      {pending && !proposal && (
        <p className="muted small"><span className="ai-dialog__spinner" /> Looking at the image…</p>
      )}
      {proposal && !proposal.ok && (
        <>
          <p className="error small">{proposal.error}</p>
          <button className="btn small" type="button" onClick={run} disabled={pending}>Try again</button>
        </>
      )}
      {proposal && proposal.ok && (
        <>
          <p style={{ margin: 0 }}>{proposal.proposedText}</p>
          {existing && (
            <p className="small muted">Current alt-text: &ldquo;{existing}&rdquo;</p>
          )}
          <div className="ai-proposal-card__actions">
            <button className="btn primary small" type="button" onClick={() => accept(proposal.id)} disabled={pending}>
              {pending ? "Applying…" : existing ? "Replace existing" : "Save as alt-text"}
            </button>
            <button className="link small muted" type="button" onClick={() => reject(proposal.id)} disabled={pending}>Reject</button>
            <button className="link small" type="button" onClick={run} disabled={pending}>Try again</button>
          </div>
        </>
      )}
    </div>
  );
}
