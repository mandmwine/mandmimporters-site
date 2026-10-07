"use client";
// Two-click confirm button that promotes every draft map_asset to approved.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAllDraftMaps } from "@/lib/actions";

export default function ApproveAllDraftsButton({ pendingCount }: { pendingCount: number }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const router = useRouter();

  function run() {
    start(async () => {
      const r = await approveAllDraftMaps();
      setResult(r.approved);
      setConfirming(false);
      router.refresh();
    });
  }

  if (result !== null) {
    return (
      <p className="ok small">
        Approved {result} draft map{result === 1 ? "" : "s"}.
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn primary small"
        disabled={pending || pendingCount === 0}
        onClick={() => setConfirming(true)}
      >
        {pendingCount === 0
          ? "No drafts to approve"
          : `Approve ${pendingCount} draft${pendingCount === 1 ? "" : "s"}`}
      </button>
    );
  }
  return (
    <div className="confirm-row">
      <span className="small">
        This approves the latest draft of every location in one pass. You can roll back per-location afterwards.
      </span>
      <button type="button" className="btn primary small" disabled={pending} onClick={run}>
        {pending ? "Approving…" : "Approve all"}
      </button>
      <button type="button" className="link small" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
    </div>
  );
}
