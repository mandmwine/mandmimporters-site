"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runQcScanAction } from "@/lib/actions";

export default function QcScanButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ total: number; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    setResult(null);
    start(async () => {
      try {
        const r = await runQcScanAction();
        if (!r.ok || !r.counts) {
          setError("Scan failed.");
          return;
        }
        setResult({ total: r.total ?? 0, counts: r.counts });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="qc-scan">
      <button type="button" className="btn primary small" onClick={run} disabled={pending}>
        {pending ? "Scanning…" : "Run QC scan"}
      </button>
      {error && <p className="error small">{error}</p>}
      {result && (
        <div className="small muted qc-scan__out">
          Opened {result.total} flag{result.total === 1 ? "" : "s"}:{" "}
          {Object.entries(result.counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
            .join(", ") || "nothing to flag — good job"}
        </div>
      )}
    </div>
  );
}
