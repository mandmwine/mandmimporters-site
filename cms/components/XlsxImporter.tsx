"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Outcome = {
  line: number;
  sku: string | null;
  name: string | null;
  vintage: string | null;
  status: "matched" | "created" | "updated" | "skipped" | "failed";
  reason?: string;
  changed?: string[];
};
type Summary = {
  total: number;
  matched_by_sku: number;
  matched_by_name: number;
  created: number;
  skipped: number;
  updated: number;
  failed: number;
  outcomes: Outcome[];
};

const MAX_BYTES = 5 * 1024 * 1024;

export default function XlsxImporter({
  action,
  kind,
}: {
  action: (fd: FormData) => Promise<{ ok: boolean; summary?: Summary; message?: string }>;
  kind: "inventory" | "prices";
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 17: for the inventory importer, let the editor opt in to
  // auto-creating any wine_vintage whose SKU / name doesn't match a current row.
  const [createMissing, setCreateMissing] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setPreview(null); setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`); return; }
    setFile(f);
  }

  function runPreview() {
    if (!file) return;
    setError(null); setResult(null); setPreview(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("dry_run", "1");
    if (kind === "inventory" && createMissing) fd.set("create_missing", "1");
    start(async () => {
      const r = await action(fd);
      if (!r.ok) { setError(r.message ?? "Preview failed"); return; }
      setPreview(r.summary ?? null);
    });
  }

  function runImport() {
    if (!file) return;
    setError(null); setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    if (kind === "inventory" && createMissing) fd.set("create_missing", "1");
    start(async () => {
      const r = await action(fd);
      if (!r.ok) { setError(r.message ?? "Import failed"); return; }
      setResult(r.summary ?? null);
      router.refresh();
    });
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const summary = result ?? preview;
  const bySection: Record<string, Outcome[]> = { failed: [], created: [], skipped: [], updated: [], matched: [] };
  for (const o of summary?.outcomes ?? []) {
    const bucket = o.status === "failed" ? "failed"
                : o.status === "created" ? "created"
                : o.status === "skipped" ? "skipped"
                : o.status === "matched" ? "matched"
                : "updated";
    bySection[bucket].push(o);
  }

  return (
    <div className="xlsx-import">
      {!file && (
        <div className="panel xlsx-import__drop">
          <label className="btn primary">
            Choose xlsx file
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>
          <p className="small muted">
            Max {MAX_BYTES / 1024 / 1024} MB.
            {" "}{kind === "inventory"
              ? "Expected columns: Item Number, Item, UoM, Inventory UoM Qty On Hand/Allocated/Available/Inbound."
              : "Expected columns: item#, Item, size, Vintage, Color, PK#/cs, FrontLine, Bottle, 2cs, 3cs, 4 cs, 5cs, 10cs, 25cs (plus the companion Bottle / Bottle .1 / … columns)."}
          </p>
        </div>
      )}

      {file && !result && (
        <div className="panel">
          <div className="panel-head">
            <h2>{file.name}</h2>
            <div className="panel-head__right">
              <button type="button" className="link small" onClick={reset}>Choose a different file</button>
            </div>
          </div>
          <p className="small muted">{Math.round(file.size / 1024)} KB</p>
          {kind === "inventory" && (
            <label className="form-checkbox" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => { setCreateMissing(e.target.checked); setPreview(null); setResult(null); }}
                disabled={pending}
              />
              Create missing wines
              <span className="small muted" style={{ marginLeft: 6 }}>
                Rows with no matching SKU or name get a new draft producer / wine / vintage added, filled in from the Item column.
              </span>
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="btn" onClick={runPreview} disabled={pending}>
              {pending && !result ? "Previewing…" : "Preview"}
            </button>
            {preview && (
              <button type="button" className="btn primary" onClick={runImport} disabled={pending}>
                {pending
                  ? "Importing…"
                  : `Import ${preview.updated} update${preview.updated === 1 ? "" : "s"}` +
                    (preview.created > 0 ? ` + ${preview.created} new` : "")}
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
            {summary.total} rows ·
            {" "}{summary.matched_by_sku} matched by SKU ·
            {" "}{summary.matched_by_name} matched by name ·
            {" "}<strong>{summary.updated}</strong> {result ? "written" : "will write"} ·
            {summary.created > 0 && (
              <> <strong className="ok-text">{summary.created}</strong> {result ? "created" : "will create"} ·</>
            )}
            {" "}{summary.skipped} skipped ·
            {" "}{summary.failed > 0
                ? <span className="warn-text">{summary.failed} failed</span>
                : <>{summary.failed} failed</>}
          </p>
          {(["failed", "created", "skipped", "updated", "matched"] as const).map((bucket) => {
            const list = bySection[bucket];
            if (list.length === 0) return null;
            return (
              <details key={bucket} className="xlsx-import__section" open={bucket === "failed" || bucket === "skipped"}>
                <summary className="strong">{bucket} ({list.length})</summary>
                <table className="table compact">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>Row</th>
                      <th>SKU</th>
                      <th>Item</th>
                      <th>Vintage</th>
                      {(bucket === "failed" || bucket === "skipped") && <th>Reason</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, 300).map((o, i) => (
                      <tr key={i}>
                        <td className="small muted">{o.line}</td>
                        <td className="small mono">{o.sku ?? "—"}</td>
                        <td className="small">{o.name ?? "—"}</td>
                        <td className="small">{o.vintage ?? "—"}</td>
                        {(bucket === "failed" || bucket === "skipped") && <td className="small">{o.reason}</td>}
                      </tr>
                    ))}
                    {list.length > 300 && (
                      <tr><td colSpan={5} className="muted small">… and {list.length - 300} more</td></tr>
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
