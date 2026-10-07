"use client";
import { useRouter, useSearchParams } from "next/navigation";

const SIZES = [25, 50, 100, 200];

export default function PerPageChooser({ current }: { current: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <label className="small per-page">
      Rows per page:
      <select
        value={current}
        onChange={(e) => {
          const u = new URLSearchParams(sp.toString());
          u.set("per", e.target.value);
          u.delete("page");
          try { localStorage.setItem("mm.perPage", e.target.value); } catch {}
          router.push(`?${u.toString()}`);
        }}
      >
        {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
