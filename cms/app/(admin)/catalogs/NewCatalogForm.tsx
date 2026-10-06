"use client";
import { useState, useTransition } from "react";
import { createCatalog } from "@/lib/actions";
import { useSelection } from "@/components/SelectionProvider";

export default function NewCatalogForm() {
  const [name, setName] = useState("");
  const [renderMode, setRenderMode] = useState("hybrid");
  const [pending, start] = useTransition();
  const sel = useSelection();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", name);
    fd.set("render_mode", renderMode);
    fd.set("wine_vintage_ids", sel.selected.map((s) => s.id).join(","));
    start(async () => {
      await createCatalog(fd);
      sel.clear();
    });
  }

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2>Create a catalog</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026 Master Catalog" required />
      </label>
      <label>
        Layout
        <select value={renderMode} onChange={(e) => setRenderMode(e.target.value)}>
          <option value="hybrid">Hybrid (overview + detailed sheets)</option>
          <option value="detailed">Detailed only (one wine per page)</option>
          <option value="compact">Compact only (lineup / trade layouts)</option>
        </select>
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        {sel.count > 0
          ? `${sel.count} wine${sel.count === 1 ? "" : "s"} currently selected and will be added.`
          : "No wines selected. You can add them from the Wines tab after."}
      </p>
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create catalog"}
      </button>
    </form>
  );
}
