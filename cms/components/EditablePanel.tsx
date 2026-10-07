"use client";
import { useEffect, useRef, useState } from "react";
import { useEscClose } from "./useEscClose";

// Lightweight edit-mode toggle around a server-action form. Hides a static
// summary when idle; reveals the <form> children when the pencil is clicked.
// `rightSlot` renders a secondary control (usually an AI button) in the panel head.
// Esc closes; the first focusable field is autofocused on open.
export default function EditablePanel({
  title,
  summary,
  children,
  canEdit = true,
  rightSlot,
}: {
  title: string;
  summary: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  canEdit?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEscClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const first = bodyRef.current.querySelector<HTMLElement>(
      "input:not([type=hidden]), select, textarea",
    );
    first?.focus();
  }, [open]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <div className="panel-head__right">
          {rightSlot}
          {canEdit && !open && (
            <button type="button" className="link small" onClick={() => setOpen(true)}>
              Edit
            </button>
          )}
        </div>
      </div>
      {open ? (
        <div ref={bodyRef}>{children(() => setOpen(false))}</div>
      ) : summary}
    </div>
  );
}
