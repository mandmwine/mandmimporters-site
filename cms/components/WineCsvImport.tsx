"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runWineCsvImport } from "@/lib/actions";

type Outcome =
  | { line: number; status: "created"; wine_id: string; vintage_id: string }
  | { line: number; status: "updated"; wine_id: string; vintage_id: string; changed: string[] }
  | { line: number; status: "skipped"; reason: string }
  | { line: number; status: "failed"; reason: string };

type Summary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  outcomes: Outcome[];
};

const MAX_BYTES = 2 * 1024 * 1024;

export default function WineCsvImport() {
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setPreview(null); setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`); return; }
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
  }

  function runPreview() {
    setError(null); setResult(null); setPreview(null);
    const fd = new FormData();
    fd.set("csv", csv);
    fd.set("dry_run", "1");
    start(async () => {
      const r = await runWineCsvImport(fd);
      if (!r.ok) { setError(r.message ?? "Preview failed"); return; }
      setPreview(r.summary ?? null);
    });
  }

  function runImport() {
    setError(null); setResult(null);
    const fd = new FormData();
    fd.set("csv", csv);
    start(async () => {
      const r = await runWineCsvImport(fd);
      if (!r.ok) { setError(r.message ?? "Import failed"); return; }
      setResult(r.summary ?? null);
      router.refresh();
    });
  }

  function reset() {
    setCsv(""); setFileName(null); setPreview(null); setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const summary = result ?? preview;
  const bySection: Record<Outcome["status"], Outcome[]> = { created: [], updated: [], skipped: [], failed: [] };
  for (const o of summary?.outcomes ?? []) bySection[o.status].push(o);

  return (
    <div className="csv-import">
      {!csv && (
        <div className="panel csv-import__drop">
          <label className="btn primary">
            Choose a CSV file
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>
          <p className="small muted">
            Max {MAX_BYTES / 1024 / 1024} MB. Export a sample from the wines list using
            Export CSV in the selection bar.
          </p>
        </div>
      )}

      {csv && !result && (
        <div className="panel">
          <div className="panel-head">
            <h2>{fileName ?? "Pasted CSV"}</h2>
            <div className="panel-head__right">
              <button type="button" className="link small" onClick={reset}>Choose a different file</button>
            </div>
          </div>
          <p className="small muted">
            {csv.split(/\r?\n/).filter((l) => l.trim()).length - 1} data rows ·
            {" "}{Math.round(csv.length / 1024)} KB
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={runPreview} disabled={pending}>
              {pending && !result ? "Previewing…" : "Preview"}
            </button>
            {preview && (
              <button type="button" className="btn primary" onClick={runImport} disabled={pending}>
                {pending ? "Importing…" : `Import ${preview.created + preview.updated} rows`}
              </button>
            )}
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
      )}

      {summary && (
        <div className="panel">
          <h2>{result ? "Done" : "Preview"}</h2>
          <p className="muted">
            <strong>{summary.created}</strong> {result ? "created" : "will create"}
            {" · "}<strong>{summary.updated}</strong> {result ? "updated" : "will update"}
            {" · "}{summary.skipped} skipped
            {" · "}
            {summary.failed > 0 ? <span className="warn-text">{summary.failed} failed</span> : <>{summary.failed} failed</>}
          </p>

          {(["failed", "created", "updated", "skipped"] as const).map((kind) => {
            const list = bySection[kind];
            if (list.length === 0) return null;
            return (
              <details key={kind} className="csv-import__section" open={kind === "failed"}>
                <summary className="strong">
                  {kind.charAt(0).toUpperCase() + kind.slice(1)} ({list.length})
                </summary>
                <table className="table compact">
                  <tbody>
                    {list.slice(0, 200).map((o) => (
                      <tr key={o.line}>
                        <td style={{ width: 60 }} className="muted small">row {o.line}</td>
                        <td className="small">
                          {o.status === "failed" || o.status === "skipped"
                            ? o.reason
                            : o.status === "updated"
                              ? `updated: ${(o.changed || []).join(", ") || "no changes"}`
                              : "created"}
                        </td>
                      </tr>
                    ))}
                    {list.length > 200 && (
                      <tr><td colSpan={2} className="muted small">… and {list.length - 200} more</td></tr>
                    )}
                  </tbody>
                </table>
              </details>
            );
          })}

          {result && (
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn" onClick={reset}>Import another file</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
