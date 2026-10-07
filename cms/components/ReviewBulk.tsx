"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetFlagStatus } from "@/lib/actions";

type FlagId = string;

export function ReviewSelectCheckbox({ id, label }: { id: FlagId; label: string }) {
  const sel = useReviewSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select flag: ${label}`}
      checked={sel.has(id)}
      onClick={(e) => e.stopPropagation()}
      onChange={() => sel.toggle(id)}
      className="row-select"
    />
  );
}

export function ReviewSelectAll({ ids }: { ids: FlagId[] }) {
  const sel = useReviewSelection();
  const ref = useRef<HTMLInputElement | null>(null);
  const picked = ids.filter((id) => sel.has(id)).length;
  const all = ids.length > 0 && picked === ids.length;
  const some = picked > 0 && !all;
  useEffect(() => { if (ref.current) ref.current.indeterminate = some; }, [some]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={all ? "Deselect all" : "Select all on this page"}
      checked={all}
      onChange={() => {
        if (all || some) sel.clear();
        else sel.set(ids);
      }}
      className="row-select"
      disabled={ids.length === 0}
    />
  );
}

export function ReviewBulkBar() {
  const sel = useReviewSelection();
  const [pending, start] = useTransition();
  const router = useRouter();
  if (sel.size === 0) return null;

  function act(status: "resolved" | "dismissed") {
    const fd = new FormData();
    fd.set("status", status);
    fd.set("ids", [...sel.ids].join(","));
    start(async () => {
      await bulkSetFlagStatus(fd);
      sel.clear();
      router.refresh();
    });
  }

  return (
    <div className="bulk-bar">
      <span className="strong">{sel.size} selected</span>
      <button
        type="button"
        className="btn primary small"
        onClick={() => act("resolved")}
        disabled={pending}
      >
        Resolve all
      </button>
      <button type="button" className="btn small" onClick={() => act("dismissed")} disabled={pending}>
        Dismiss all
      </button>
      <button type="button" className="link small" onClick={sel.clear} disabled={pending}>
        Clear
      </button>
    </div>
  );
}

// Tiny self-contained store so review selection doesn't pollute the global
// SelectionProvider (which is for catalog-building).
let listeners = new Set<() => void>();
let ids = new Set<FlagId>();

function useReviewSelection() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((x) => x + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  function notify() { for (const fn of listeners) fn(); }
  return {
    has: (id: FlagId) => ids.has(id),
    toggle: (id: FlagId) => {
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      notify();
    },
    set: (next: FlagId[]) => {
      ids = new Set(next);
      notify();
    },
    clear: () => {
      ids = new Set();
      notify();
    },
    get size() { return ids.size; },
    get ids() { return ids; },
  };
}
