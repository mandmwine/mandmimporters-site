"use client";
// Phase 16: one-click clone of a catalog's composition.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cloneCatalog } from "@/lib/actions";

export default function CloneCatalogButton({ catalogId, suggestedName }: { catalogId: string; suggestedName: string }) {
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("catalog_id", catalogId);
    start(async () => {
      const r = await cloneCatalog(fd);
      if (!r.ok || !r.id) {
        setError(r.message ?? "Clone failed.");
        return;
      }
      router.push(`/catalogs/${r.id}`);
    });
  }

  if (!opening) {
    return (
      <button type="button" className="btn small" onClick={() => setOpening(true)} disabled={pending}>
        Clone this catalog
      </button>
    );
  }
  return (
    <form className="form-grid" onSubmit={run} style={{ marginTop: 10 }}>
      <label>
        New catalog name
        <input name="name" defaultValue={suggestedName} required autoFocus />
      </label>
      <div className="form-actions">
        <button className="btn primary small" type="submit" disabled={pending}>
          {pending ? "Cloning…" : "Create copy"}
        </button>
        <button type="button" className="link small" onClick={() => setOpening(false)}>Cancel</button>
        {error && <span className="error small">{error}</span>}
      </div>
      <p className="small muted">
        Copies sections, items, and settings. Export history, share links, and recipients stay with the original.
      </p>
    </form>
  );
}
