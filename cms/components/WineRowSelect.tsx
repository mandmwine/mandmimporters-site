"use client";
import { useEffect, useRef } from "react";
import { useSelection } from "./SelectionProvider";

export default function WineRowSelect({
  id,
  label,
  producer,
}: {
  id: string;
  label: string;
  producer?: string;
}) {
  const sel = useSelection();
  const checked = sel.has(id);
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      checked={checked}
      onClick={(e) => e.stopPropagation()}
      onChange={() => sel.toggle({ id, label, producer })}
      className="row-select"
    />
  );
}

// Real tri-state checkbox for the table header.
// - Empty → clicking selects every row on this page
// - Full  → clicking deselects every row on this page
// - Partial → indeterminate dash; clicking selects the rest
export function SelectAllCheckbox({
  entries,
  idPrefix = "sa",
}: {
  entries: { id: string; label: string; producer?: string }[];
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
    if (allHere || some) {
      entries.forEach((e) => sel.has(e.id) && sel.toggle(e));
    } else {
      entries.forEach((e) => !sel.has(e.id) && sel.toggle(e));
    }
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
