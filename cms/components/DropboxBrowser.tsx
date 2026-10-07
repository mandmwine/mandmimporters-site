"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importFromDropbox, type DropboxImportResult } from "@/lib/actions";

type Entry = {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
};

const KINDS = ["bottle", "map", "logo", "photo", "document", "pdf", "other"] as const;

function fmtBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function parentPath(p: string): string | null {
  if (!p || p === "/" || p === "") return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  parts.pop();
  return parts.length === 0 ? "" : "/" + parts.join("/");
}

// A simple folder browser. Lists one Dropbox folder at a time; shift-click a
// folder to open it; checkbox files to import. "Import N" sends them to the
// importFromDropbox server action and shows the per-file outcome.
export default function DropboxBrowser({
  startPath,
  defaultKind,
}: {
  startPath: string;
  defaultKind: string;
}) {
  const router = useRouter();
  const [path, setPath] = useState(startPath);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<string>(KINDS.includes(defaultKind as (typeof KINDS)[number]) ? defaultKind : "photo");
  const [pending, start] = useTransition();
  const [results, setResults] = useState<DropboxImportResult[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (p: string, c?: string) => {
    setLoading(true);
    setError(null);
    if (!c) setEntries([]);
    try {
      const url = `/catalog-admin/api/dropbox/list?path=${encodeURIComponent(p)}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`;
      const res = await fetch(url);
      const body = (await res.json()) as { entries?: Entry[]; cursor?: string; has_more?: boolean; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not list folder.");
        return;
      }
      setEntries((cur) => c ? [...cur, ...(body.entries ?? [])] : (body.entries ?? []));
      setCursor(body.cursor ?? null);
      setHasMore(Boolean(body.has_more));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(path); }, [path, load]);

  function openFolder(p: string) {
    setSelected(new Set());
    setResults(null);
    setPath(p);
    // Also update the URL so refresh works.
    const u = new URL(window.location.href);
    u.searchParams.set("path", p);
    window.history.replaceState({}, "", u.toString());
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0 }), 0);
  }

  function toggle(p: string) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p); else next.add(p);
    setSelected(next);
  }

  function toggleAll() {
    const files = entries.filter((e) => e[".tag"] === "file" && e.path_display).map((e) => e.path_display!);
    if (files.every((f) => selected.has(f))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files));
    }
  }

  function runImport() {
    setResults(null);
    const paths = [...selected];
    if (paths.length === 0) return;
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("paths", paths.join("\n"));
    start(async () => {
      const r = await importFromDropbox(fd);
      setResults(r.results);
      setSelected(new Set());
      router.refresh();
    });
  }

  const files = entries.filter((e) => e[".tag"] === "file");
  const folders = entries.filter((e) => e[".tag"] === "folder");
  const parent = parentPath(path);

  const importedCount = results?.filter((r) => r.status === "imported").length ?? 0;
  const dedupedCount = results?.filter((r) => r.status === "deduped").length ?? 0;
  const failedCount = results?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <div className="dropbox-browser">
      <nav className="crumbs dropbox-crumbs">
        <button type="button" className="link small" onClick={() => openFolder("")}>
          Root
        </button>
        {path !== "" && path !== "/" && path.split("/").filter(Boolean).map((seg, i, arr) => {
          const p = "/" + arr.slice(0, i + 1).join("/");
          return (
            <span key={p}>
              {" / "}
              <button type="button" className="link small" onClick={() => openFolder(p)}>{seg}</button>
            </span>
          );
        })}
      </nav>

      <div className="dropbox-toolbar">
        {parent !== null && (
          <button type="button" className="btn small" onClick={() => openFolder(parent)}>
            ← Up
          </button>
        )}
        <label className="small">
          Import as:
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span className="small muted">
          {files.length} file{files.length === 1 ? "" : "s"} · {folders.length} folder{folders.length === 1 ? "" : "s"}
          {hasMore && " · more…"}
        </span>
        <span className="spacer" />
        {files.length > 0 && (
          <button type="button" className="link small" onClick={toggleAll}>
            {files.every((f) => f.path_display && selected.has(f.path_display)) ? "Deselect all files" : "Select all files"}
          </button>
        )}
        <button
          type="button"
          className="btn primary small"
          disabled={pending || selected.size === 0}
          onClick={runImport}
        >
          {pending ? "Importing…" : `Import ${selected.size || ""}`}
        </button>
      </div>

      {error && <p className="error small">{error}</p>}
      {loading && entries.length === 0 && <p className="muted small">Loading…</p>}

      {results && (
        <div className={`panel ${failedCount > 0 ? "notice-warn" : ""}`} style={{ marginBottom: 12 }}>
          <strong>
            {importedCount} imported
            {dedupedCount > 0 && ` · ${dedupedCount} already in library`}
            {failedCount > 0 && ` · ${failedCount} failed`}
          </strong>
          {failedCount > 0 && (
            <ul className="plain-list small muted" style={{ marginTop: 6 }}>
              {results.filter((r) => r.status === "failed").map((r) => (
                <li key={r.path}><code>{r.path}</code> — {r.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="dropbox-list" ref={scrollRef}>
        {folders.map((f) => (
          <button
            key={f.path_lower}
            type="button"
            className="dropbox-row dropbox-row--folder"
            onClick={() => f.path_display && openFolder(f.path_display)}
          >
            <span className="dropbox-row__icon" aria-hidden>📁</span>
            <span className="dropbox-row__name">{f.name}</span>
            <span className="dropbox-row__meta small muted">folder</span>
          </button>
        ))}
        {files.map((f) => (
          <label key={f.path_lower} className="dropbox-row dropbox-row--file">
            <input
              type="checkbox"
              checked={Boolean(f.path_display && selected.has(f.path_display))}
              onChange={() => f.path_display && toggle(f.path_display)}
            />
            <span className="dropbox-row__icon" aria-hidden>
              {/\.(jpe?g|png|webp|avif|svg|gif)$/i.test(f.name) ? "🖼️" :
               /\.pdf$/i.test(f.name) ? "📄" :
               /\.(mp4|mov|m4v)$/i.test(f.name) ? "🎞️" : "📎"}
            </span>
            <span className="dropbox-row__name">{f.name}</span>
            <span className="dropbox-row__meta small muted">
              {fmtBytes(f.size)}
              {f.server_modified && ` · ${new Date(f.server_modified).toLocaleDateString("en-US")}`}
            </span>
          </label>
        ))}
        {entries.length === 0 && !loading && (
          <p className="muted small">This folder is empty.</p>
        )}
      </div>

      {hasMore && cursor && (
        <div className="dropbox-more">
          <button
            type="button"
            className="btn small"
            disabled={loading}
            onClick={() => void load(path, cursor)}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
