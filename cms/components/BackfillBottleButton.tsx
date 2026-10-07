"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backfillLegacyBottles } from "@/lib/actions";

type Summary = {
  total: number;
  imported: number;
  deduped: number;
  failed: number;
  outcomes: { vintage_id: string; status: string; message?: string }[];
};

export default function BackfillBottleButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function run() {
    setError(null); setResult(null);
    start(async () => {
      const r = await backfillLegacyBottles();
      if (!r.ok) { setError(r.message ?? "Backfill failed"); return; }
      setResult(r.summary ?? null);
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn primary small"
          disabled={disabled || pending}
          onClick={() => setConfirming(true)}
        >
          {disabled ? "Nothing to backfill" : "Backfill bottle images"}
        </button>
        {result && (
          <div className="small muted" style={{ marginTop: 6 }}>
            Done — <strong>{result.imported}</strong> imported ·
            {" "}{result.deduped} already existed ·
            {" "}{result.failed > 0 && <span className="warn-text">{result.failed} failed</span>}
          </div>
        )}
        {result && result.failed > 0 && (
          <details className="small" style={{ marginTop: 4 }}>
            <summary>Failures</summary>
            <ul className="plain-list small">
              {result.outcomes.filter((o) => o.status === "failed").slice(0, 20).map((o) => (
                <li key={o.vintage_id}><code className="mono">{o.vintage_id}</code> — {o.message}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="confirm-row" style={{ marginTop: 10 }}>
      <span className="small">
        This downloads up to ~108 images from mandmimporters.com. It&rsquo;s safe to
        run again — files already in the library are deduped by SHA-256.
      </span>
      <button type="button" className="btn primary small" disabled={pending} onClick={run}>
        {pending ? "Backfilling…" : "Run backfill"}
      </button>
      <button type="button" className="link small" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
