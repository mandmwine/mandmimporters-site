"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSelection } from "./SelectionProvider";
import { addWinesToCatalog, createCatalog } from "@/lib/actions";

type Catalog = { id: string; name: string };

export default function SelectionBar({ existingCatalogs }: { existingCatalogs: Catalog[] }) {
  const sel = useSelection();
  const [open, setOpen] = useState<null | "create" | "add" | "export">(null);
  const [name, setName] = useState("");
  const [catalogId, setCatalogId] = useState<string>(existingCatalogs[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  if (sel.count === 0) return null;

  const onWinesPage = pathname === "/wines" || pathname?.startsWith("/wines");

  // When the export chooser opens on the wines page, fetch the total count of
  // vintages matching the current filters so the "Export all" button can say
  // exactly how many wines it would export.
  async function openExport() {
    setOpen("export");
    if (!onWinesPage) return;
    setMatchingCount(null);
    try {
      const q = new URLSearchParams();
      for (const k of ["q", "status", "country", "missing"]) {
        const v = search?.get(k);
        if (v) q.set(k, v);
      }
      const res = await fetch(`/catalog-admin/api/wines/count?${q.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { total: number };
        setMatchingCount(data.total);
      }
    } catch {
      // Count is a nicety — if the fetch fails, the button still works.
    }
  }

  function exportSelected() {
    const ids = sel.selected.map((s) => s.id).join(",");
    window.location.href = `/catalog-admin/api/wines/export?ids=${encodeURIComponent(ids)}`;
    setOpen(null);
  }
  function exportAll() {
    // Mirror the current URL's filters into the export URL so "all" means
    // the same thing the user is looking at.
    const q = new URLSearchParams();
    q.set("all", "1");
    for (const k of ["q", "status", "country", "missing", "sort", "dir"]) {
      const v = search?.get(k);
      if (v) q.set(k, v);
    }
    window.location.href = `/catalog-admin/api/wines/export?${q.toString()}`;
    setOpen(null);
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", name);
    fd.set("render_mode", "hybrid");
    fd.set("wine_vintage_ids", sel.selected.map((s) => s.id).join(","));
    start(async () => {
      await createCatalog(fd);
      sel.clear();
      router.refresh();
    });
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!catalogId) return;
    const fd = new FormData();
    fd.set("catalog_id", catalogId);
    fd.set("wine_vintage_ids", sel.selected.map((s) => s.id).join(","));
    start(async () => {
      await addWinesToCatalog(fd);
      sel.clear();
      setOpen(null);
      router.push(`/catalogs/${catalogId}`);
    });
  }

  return (
    <div className="selbar">
      <div className="selbar__inner">
        <div className="selbar__count">
          <strong>{sel.count}</strong> wine{sel.count === 1 ? "" : "s"} selected
          <button className="link small muted" onClick={() => sel.clear()} type="button">Clear</button>
        </div>
        <div className="selbar__actions">
          <button className="btn primary" type="button" onClick={() => setOpen("create")}>
            Create catalog
          </button>
          {existingCatalogs.length > 0 && (
            <button className="btn" type="button" onClick={() => setOpen("add")}>
              Add to existing
            </button>
          )}
          <button className="btn" type="button" onClick={openExport} title="Export wines as a CSV file">
            Export CSV
          </button>
          <Link className="btn" href={`/catalogs`}>
            All catalogs
          </Link>
        </div>
      </div>

      {open === "create" && (
        <div className="selbar__panel">
          <form onSubmit={submitCreate} className="inline-form">
            <input
              type="text"
              placeholder="Catalog name (e.g. 2026 Chanukah)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              style={{ minWidth: 260 }}
            />
            <button className="btn primary small" disabled={pending}>
              {pending ? "Creating…" : `Create with ${sel.count} wines`}
            </button>
            <button className="link small" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </form>
        </div>
      )}

      {open === "add" && (
        <div className="selbar__panel">
          <form onSubmit={submitAdd} className="inline-form">
            <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              {existingCatalogs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn primary small" disabled={pending}>
              {pending ? "Adding…" : `Add ${sel.count} wines`}
            </button>
            <button className="link small" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </form>
        </div>
      )}

      {open === "export" && (
        <div className="selbar__panel export-chooser">
          <strong>Export which wines?</strong>
          <div className="export-chooser__row">
            <button className="btn primary" type="button" onClick={exportSelected}>
              Export selected ({sel.count})
            </button>
            {onWinesPage && (
              <button
                className="btn"
                type="button"
                onClick={exportAll}
                disabled={matchingCount !== null && matchingCount <= sel.count}
              >
                {matchingCount === null
                  ? "Export all matching filters…"
                  : `Export all matching filters (${matchingCount})`}
              </button>
            )}
            <button className="link small" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </div>
          <p className="small muted">
            Selected = just the <strong>{sel.count}</strong> row{sel.count === 1 ? "" : "s"} ticked right now (across all pages).
            {onWinesPage && (
              <> Matching filters = every wine that matches your current search / filters, not only the current page.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
