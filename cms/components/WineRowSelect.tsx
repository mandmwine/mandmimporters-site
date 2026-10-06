"use client";
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
      onChange={() => sel.toggle({ id, label, producer })}
      className="row-select"
    />
  );
}

export function SelectAllButton({
  entries,
}: {
  entries: { id: string; label: string; producer?: string }[];
}) {
  const sel = useSelection();
  const allHere = entries.every((e) => sel.has(e.id));
  function toggleAll() {
    if (allHere) {
      // Deselect only those on this page
      entries.forEach((e) => sel.has(e.id) && sel.toggle(e));
    } else {
      entries.forEach((e) => !sel.has(e.id) && sel.toggle(e));
    }
  }
  return (
    <button type="button" className="link small" onClick={toggleAll}>
      {allHere ? "Deselect this page" : "Select this page"}
    </button>
  );
}
