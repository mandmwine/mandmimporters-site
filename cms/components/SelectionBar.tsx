"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSelection } from "./SelectionProvider";
import { addWinesToCatalog, createCatalog } from "@/lib/actions";

type Catalog = { id: string; name: string };

export default function SelectionBar({ existingCatalogs }: { existingCatalogs: Catalog[] }) {
  const sel = useSelection();
  const [open, setOpen] = useState<null | "create" | "add">(null);
  const [name, setName] = useState("");
  const [catalogId, setCatalogId] = useState<string>(existingCatalogs[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (sel.count === 0) return null;

  function exportCsv() {
    const ids = sel.selected.map((s) => s.id).join(",");
    window.location.href = `/catalog-admin/api/wines/export?ids=${encodeURIComponent(ids)}`;
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
          <button className="btn" type="button" onClick={exportCsv} title="Export the selected wines as a CSV file">
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
    </div>
  );
}
