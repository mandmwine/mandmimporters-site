"use client";
import { useState } from "react";

// Lightweight edit-mode toggle around a server-action form. Hides a static
// summary when idle; reveals the <form> children when the pencil is clicked.
export default function EditablePanel({
  title,
  summary,
  children,
  canEdit = true,
}: {
  title: string;
  summary: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {canEdit && !open && (
          <button type="button" className="link small" onClick={() => setOpen(true)}>
            Edit
          </button>
        )}
      </div>
      {open ? children(() => setOpen(false)) : summary}
    </div>
  );
}
