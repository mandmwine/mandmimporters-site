"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reinsertCatalogItem, removeCatalogItem, reorderCatalogItems } from "@/lib/actions";
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

export default function CatalogItemsReorder({
  catalogId,
  items,
  canEdit,
}: {
  catalogId: string;
  items: CatalogItemRow[];
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
          </div>
        </div>
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
