"use client";
import { useEffect, useRef } from "react";
import { useSelection } from "./SelectionProvider";

type Entry = { id: string; label: string; producer?: string };

export default function WineRowSelect({
  id,
  label,
  producer,
  index,
  entries,
}: {
  id: string;
  label: string;
  producer?: string;
  // Optional, enables shift-click range select.
  index?: number;
  entries?: Entry[];
}) {
  const sel = useSelection();
  const checked = sel.has(id);

  function onClick(e: React.MouseEvent<HTMLInputElement>) {
    e.stopPropagation();
    // Shift-click: select the range from the last toggled row to this one.
    if (e.shiftKey && typeof index === "number" && entries) {
      const prev = sel.getLastIndex();
      if (prev !== null && prev !== index) {
        const [a, b] = prev < index ? [prev, index] : [index, prev];
        const range = entries.slice(a, b + 1);
        // If this row would end up checked, add the whole range; otherwise
        // deselect it. (Match macOS Finder.)
        if (!checked) sel.addMany(range);
        else sel.removeMany(range.map((r) => r.id));
        sel.recordLastIndex(index);
        e.preventDefault();   // we handled it manually
        return;
      }
    }
    // Normal click: let the onChange toggle, record the index.
    if (typeof index === "number") sel.recordLastIndex(index);
  }

  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      checked={checked}
      onClick={onClick}
      onChange={(ev) => {
        // onChange only fires for plain clicks; shift-click branch returned early.
        if (!ev.nativeEvent || !(ev.nativeEvent as MouseEvent).shiftKey) {
          sel.toggle({ id, label, producer });
        }
      }}
      className="row-select"
    />
  );
}

// Real tri-state checkbox for the table header.
export function SelectAllCheckbox({
  entries,
  idPrefix = "sa",
}: {
  entries: Entry[];
  idPrefix?: string;
}) {
  const sel = useSelection();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedHere = entries.filter((e) => sel.has(e.id)).length;
  const allHere = entries.length > 0 && selectedHere === entries.length;
  const some = selectedHere > 0 && !allHere;

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = some;
  }, [some]);

  function toggleAll() {
    if (allHere || some) sel.removeMany(entries.map((e) => e.id));
    else sel.addMany(entries);
  }

  const id = `${idPrefix}-select-all`;
  const title = allHere
    ? "Deselect all on this page"
    : some
      ? `${selectedHere} of ${entries.length} on this page selected — click to select the rest`
      : "Select all on this page";

  return (
    <label className="row-select-wrap" title={title}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        aria-label={title}
        checked={allHere}
        onChange={toggleAll}
        className="row-select"
        disabled={entries.length === 0}
      />
    </label>
  );
}
