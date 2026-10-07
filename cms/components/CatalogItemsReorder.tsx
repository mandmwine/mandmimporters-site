"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeCatalogItem, reorderCatalogItems } from "@/lib/actions";
import DragReorderList, { type DragItem } from "./DragReorderList";

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

  async function reorder(orderedIds: string[]) {
    const fd = new FormData();
    fd.set("catalog_id", catalogId);
    fd.set("ids", orderedIds.join(","));
    await reorderCatalogItems(fd);
  }

  function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await removeCatalogItem(fd);
      router.refresh();
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
            onClick={() => remove(it.id)}
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
