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

  // Cmd/Ctrl+S saves the panel in focus by firing a submit on its form.
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const body = bodyRef.current;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        // Only intercept if focus is inside this panel.
        const el = document.activeElement as HTMLElement | null;
        if (!el || !body.contains(el)) return;
        const form = body.querySelector("form");
        if (!form) return;
        e.preventDefault();
        // requestSubmit() runs validation and fires onSubmit the normal way.
        form.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
