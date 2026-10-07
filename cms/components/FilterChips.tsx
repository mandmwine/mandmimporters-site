"use client";
import { useRouter, useSearchParams } from "next/navigation";

export type Chip = {
  key: string;         // url param name
  value: string;       // url param value
  label: string;       // displayed on the chip
};

export default function FilterChips({ chips }: { chips: Chip[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  if (chips.length === 0) return null;

  function remove(key: string) {
    const u = new URLSearchParams(sp.toString());
    u.delete(key);
    u.delete("page");
    const qs = u.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  function clearAll() {
    router.push("?");
  }

  return (
    <div className="filter-chips">
      {chips.map((c) => (
        <button
          key={`${c.key}-${c.value}`}
          type="button"
          className="filter-chip"
          onClick={() => remove(c.key)}
          title={`Remove ${c.label}`}
        >
          <span>{c.label}</span>
          <span aria-hidden className="filter-chip__x">×</span>
        </button>
      ))}
      <button type="button" className="link small" onClick={clearAll}>
        Clear all
      </button>
    </div>
  );
}
