"use client";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  label: string;
  field: string;
  className?: string;
};

// Column header that cycles through: unsorted → sort ASC → sort DESC → unsorted.
// Sort state lives in the URL as ?sort=<field>&dir=<asc|desc> so refresh
// and share work.  Clicking preserves every other filter.
export default function SortableTh({ label, field, className }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const curSort = sp.get("sort") ?? "";
  const curDir = sp.get("dir") === "desc" ? "desc" : "asc";
  const active = curSort === field;
  const nextDir =
    !active ? "asc" :
    curDir === "asc" ? "desc" : "clear";

  function cycle() {
    const u = new URLSearchParams(sp.toString());
    if (nextDir === "clear") {
      u.delete("sort");
      u.delete("dir");
    } else {
      u.set("sort", field);
      u.set("dir", nextDir);
    }
    // Reset to page 1 whenever the sort changes.
    u.delete("page");
    const qs = u.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  const arrow = !active ? "" : curDir === "asc" ? " ▲" : " ▼";

  return (
    <th className={className}>
      <button
        type="button"
        className={`th-sort${active ? " th-sort--active" : ""}`}
        onClick={cycle}
        title={
          !active ? `Sort by ${label}` :
          curDir === "asc" ? `Sort by ${label} descending` : `Clear sort`
        }
      >
        {label}{arrow}
      </button>
    </th>
  );
}
