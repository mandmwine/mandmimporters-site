"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCatalogSection,
  reorderCatalogSections,
  setSectionRenderMode,
} from "@/lib/actions";
import DragReorderList, { type DragItem } from "./DragReorderList";

export type SectionRow = {
  id: string;
  kind: string;
  title: string | null;
  layout: string;
  wine_count: number;
};

const KIND_LABEL: Record<string, string> = {
  cover: "Cover",
  intro: "Intro",
  toc: "Table of contents",
  regional_index: "Regional index",
  divider: "Divider",
  producer_intro: "Producer intro",
  wines: "Wines",
  producer_index: "Producer index",
  contact: "Contact",
  back_cover: "Back cover",
};

const LAYOUT_LABEL: Record<string, string> = {
  detailed: "Detailed (one per page)",
  editorial: "Editorial (two per page, reading-forward)",
  portfolio: "Portfolio (auto-grouped by producer)",
  lineup: "Lineup (producer-focused, 2–6/page)",
  trade: "Trade sheet (dense, 8+/page)",
  compact: "Compact",
};

export default function CatalogSectionsReorder({
  catalogId,
  sections,
  canEdit,
}: {
  catalogId: string;
  sections: SectionRow[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function reorder(orderedIds: string[]) {
    const fd = new FormData();
    fd.set("catalog_id", catalogId);
    fd.set("ids", orderedIds.join(","));
    await reorderCatalogSections(fd);
  }

  function del(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await deleteCatalogSection(fd);
      router.refresh();
    });
  }

  function setMode(id: string, mode: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("mode", mode);
    start(async () => {
      await setSectionRenderMode(fd);
      router.refresh();
    });
  }

  const items: DragItem[] = sections.map((s) => ({
    id: s.id,
    content: (
      <div className="section-row">
        <div>
          <strong>{KIND_LABEL[s.kind] ?? s.kind}</strong>
          {s.title && s.title !== s.kind && <span className="muted"> · {s.title}</span>}
          {s.kind === "wines" && (
            <div className="muted small">
              {s.wine_count} wine{s.wine_count === 1 ? "" : "s"} · layout: {LAYOUT_LABEL[s.layout] ?? s.layout}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="inline-actions">
            {s.kind === "wines" && (
              <select
                value={s.layout}
                onChange={(e) => setMode(s.id, e.target.value)}
                disabled={pending}
                aria-label="Change section layout"
              >
                <option value="detailed">Detailed</option>
                <option value="editorial">Editorial</option>
                <option value="portfolio">Portfolio</option>
                <option value="lineup">Lineup</option>
                <option value="trade">Trade</option>
                <option value="compact">Compact</option>
              </select>
            )}
            <button
              type="button"
              className="link small muted"
              onClick={() => del(s.id)}
              disabled={pending}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    ),
  }));

  return (
    <DragReorderList
      items={items}
      onReorder={reorder}
      disabled={!canEdit}
      className="section-list"
    />
  );
}
