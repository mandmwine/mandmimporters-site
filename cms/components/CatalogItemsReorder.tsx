"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  moveCatalogItemToSection,
  reinsertCatalogItem,
  removeCatalogItem,
  reorderCatalogItems,
} from "@/lib/actions";
import DragReorderList, { type DragItem } from "./DragReorderList";
import { useUndo } from "./UndoToast";

export type CatalogItemRow = {
  id: string;
  wine_vintage_id: string;
  wine_name: string;
  producer: string;
  vintage_text: string | null;
  has_image: boolean;
  flag_count: number;
  section_id: string | null;
};

export type WineSectionOption = {
  id: string;
  title: string | null;
  position: number;
};

export default function CatalogItemsReorder({
  catalogId,
  items,
  sections,
  canEdit,
}: {
  catalogId: string;
  items: CatalogItemRow[];
  // Phase 30 — Wines-kind sections only; passed in so each row can offer
  // a "Move to…" dropdown that reassigns the item across sections.
  sections: WineSectionOption[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const undo = useUndo();

  async function reorder(orderedIds: string[]) {
    const fd = new FormData();
    fd.set("catalog_id", catalogId);
    fd.set("ids", orderedIds.join(","));
    await reorderCatalogItems(fd);
  }

  function moveToSection(id: string, sectionId: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("section_id", sectionId);
    start(async () => {
      await moveCatalogItemToSection(fd);
      router.refresh();
    });
  }

  function remove(id: string, label: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      const res = await removeCatalogItem(fd);
      router.refresh();
      if (res.ok && res.removed) {
        const snap = res.removed;
        undo.show(`Removed ${label}`, async () => {
          const back = new FormData();
          back.set("catalog_id", snap.catalog_id);
          back.set("wine_vintage_id", snap.wine_vintage_id);
          back.set("section_id", snap.section_id ?? "");
          back.set("position", String(snap.position));
          back.set("render_mode_override", snap.render_mode_override ?? "");
          await reinsertCatalogItem(back);
          router.refresh();
        });
      }
    });
  }

  const sectionLabel = (sid: string | null) => {
    if (!sid) return "— unassigned —";
    const s = sections.find((x) => x.id === sid);
    return s ? (s.title && s.title.trim() ? s.title : `Wines (position ${s.position})`) : "— unknown —";
  };

  const dragItems: DragItem[] = items.map((it, i) => ({
    id: it.id,
    content: (
      <div className="catalog-item-row">
        <span className="muted catalog-item-row__n">{i + 1}</span>
        <div className="catalog-item-row__body">
          <Link className="strong" href={`/wines/${it.wine_vintage_id}`}>{it.wine_name}</Link>
          <div className="muted small">
            {it.producer}
            {it.vintage_text ? ` · ${it.vintage_text}` : ""}
            {!it.has_image && <span className="warn-text"> · no image</span>}
            {it.flag_count > 0 && <span className="warn-text"> · {it.flag_count} open flag{it.flag_count === 1 ? "" : "s"}</span>}
            {" · in "}
            <em>{sectionLabel(it.section_id)}</em>
          </div>
        </div>
        {canEdit && sections.length > 0 && (
          // Phase 30 — move-to-section dropdown lets a user cross section
          // boundaries without drag-and-drop (useful when sections are far
          // apart in the list, or on touch devices).
          <select
            className="catalog-item-row__move"
            value={it.section_id ?? ""}
            onChange={(e) => moveToSection(it.id, e.target.value)}
            disabled={pending}
            aria-label="Move to a different section"
            title="Move to a different section"
          >
            <option value="">— unassigned —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title && s.title.trim() ? s.title : `Wines (position ${s.position})`}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <button
            type="button"
            className="link small muted"
            onClick={() => remove(it.id, `${it.wine_name}${it.vintage_text ? ` ${it.vintage_text}` : ""}`)}
            disabled={pending}
          >
            Remove
          </button>
        )}
      </div>
    ),
  }));

  return (
    <DragReorderList
      items={dragItems}
      onReorder={reorder}
      disabled={!canEdit}
      className="catalog-items"
    />
  );
}
