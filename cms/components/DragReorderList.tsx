"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type DragItem = {
  id: string;
  content: React.ReactNode;
};

// Thin wrapper around HTML5 drag-and-drop for reordering a list of rows.
// On every drop we call `onReorder(nextOrderedIds)` which should hit a server
// action that rewrites the position column. The parent is responsible for the
// server action; this component just handles the UX.
export default function DragReorderList({
  items,
  onReorder,
  className,
  disabled,
}: {
  items: DragItem[];
  onReorder: (orderedIds: string[]) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}) {
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Keep local order in sync when the server rerenders a different list.
  const incoming = items.map((i) => i.id).join(",");
  const local = order.join(",");
  if (incoming !== local && dragId === null) {
    // Only sync when we're not mid-drag.
    setOrder(items.map((i) => i.id));
  }

  function onDragStart(id: string) {
    if (disabled) return;
    setDragId(id);
  }

  function onDragOver(id: string, e: React.DragEvent) {
    if (disabled || !dragId || id === dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  }

  function onDrop(targetId: string) {
    if (disabled || !dragId) return;
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) {
      setDragId(null);
      setOverId(null);
      return;
    }
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    setDragId(null);
    setOverId(null);
    start(async () => {
      await onReorder(next);
      router.refresh();
    });
  }

  function onDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  const itemsById = new Map(items.map((i) => [i.id, i]));

  return (
    <ol className={`drag-list${className ? " " + className : ""}${pending ? " drag-list--pending" : ""}`}>
      {order.map((id) => {
        const item = itemsById.get(id);
        if (!item) return null;
        const isDrag = dragId === id;
        const isOver = overId === id;
        return (
          <li
            key={id}
            draggable={!disabled}
            onDragStart={() => onDragStart(id)}
            onDragOver={(e) => onDragOver(id, e)}
            onDrop={() => onDrop(id)}
            onDragEnd={onDragEnd}
            className={`drag-item${isDrag ? " drag-item--dragging" : ""}${isOver ? " drag-item--over" : ""}`}
          >
            {!disabled && <span className="drag-handle" aria-hidden title="Drag to reorder">⋮⋮</span>}
            <div className="drag-item__body">{item.content}</div>
          </li>
        );
      })}
    </ol>
  );
}
