"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkSetAssetKind, bulkDeleteAssets } from "@/lib/actions";

export type AssetTile = {
  id: string;
  kind: string;
  file_name: string | null;
  width_px: number | null;
  height_px: number | null;
  bytes: number;
  used_count: number;
  bottle_vintage_id: string | null;
  wine_display_name: string | null;
  wine_vintage_text: string | null;
  alt_text: string;
};

const KINDS = ["bottle", "map", "logo", "photo", "document", "pdf", "other"] as const;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetGrid({ tiles, canEdit }: { tiles: AssetTile[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
    setConfirmDelete(false);
  }

  function onBulkKind(kind: string) {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("ids", [...selected].join(","));
    start(async () => {
      await bulkSetAssetKind(fd);
      clearSelection();
      router.refresh();
    });
  }

  function onBulkDelete() {
    const fd = new FormData();
    fd.set("ids", [...selected].join(","));
    start(async () => {
      await bulkDeleteAssets(fd);
      clearSelection();
      router.refresh();
    });
  }

  return (
    <>
      {canEdit && selected.size > 0 && (
        <div className="bulk-bar">
          <span className="strong">{selected.size} selected</span>
          <label className="small">
            Change kind to:
            <select
              onChange={(e) => {
                if (e.target.value) onBulkKind(e.target.value);
                e.currentTarget.value = "";
              }}
              defaultValue=""
              disabled={pending}
            >
              <option value="" disabled>Choose…</option>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {!confirmDelete ? (
            <button
              type="button"
              className="btn danger small"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              Delete selected
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn danger small"
                onClick={onBulkDelete}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                className="link small"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                Cancel
              </button>
            </>
          )}
          <button type="button" className="link small" onClick={clearSelection} disabled={pending}>
            Clear
          </button>
        </div>
      )}
      <section className="asset-grid">
        {tiles.map((a) => {
          const resLow = a.width_px !== null && a.width_px < 800;
          const checked = selected.has(a.id);
          return (
            <article key={a.id} className={`asset-tile${checked ? " asset-tile--selected" : ""}`}>
              {canEdit && (
                <label className="asset-tile__check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(a.id)}
                  />
                </label>
              )}
              <Link href={`/assets/${a.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/catalog-admin/api/assets/${a.id}`}
                  alt={a.alt_text || a.file_name || ""}
                  loading="lazy"
                />
              </Link>
              <div className="asset-tile__meta small">
                <div className="muted">
                  {a.kind} · {fmtBytes(a.bytes)}
                  {a.width_px && a.height_px && ` · ${a.width_px}×${a.height_px}`}
                </div>
                {a.bottle_vintage_id ? (
                  <Link href={`/wines/${a.bottle_vintage_id}`} className="strong">
                    {a.wine_display_name}
                    {a.wine_vintage_text ? ` ${a.wine_vintage_text}` : ""}
                  </Link>
                ) : (
                  <span className="muted">
                    {a.used_count > 0
                      ? `Linked to ${a.used_count} wine${a.used_count === 1 ? "" : "s"}`
                      : "Not used"}
                  </span>
                )}
                {resLow && <div className="warn-text small">Low resolution</div>}
              </div>
            </article>
          );
        })}
        {tiles.length === 0 && (
          <p className="muted">No assets match this filter.</p>
        )}
      </section>
    </>
  );
}
