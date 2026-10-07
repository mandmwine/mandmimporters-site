"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function JumpToPage({ pages }: { pages: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [val, setVal] = useState("");
  if (pages <= 1) return null;
  function go(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.min(pages, parseInt(val, 10) || 1));
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(n));
    router.push(`?${u.toString()}`);
    setVal("");
  }
  return (
    <form className="jump-to-page" onSubmit={go}>
      <label className="small muted">
        Go to page
        <input
          type="number"
          min={1}
          max={pages}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          aria-label="Jump to page"
          placeholder=""
        />
      </label>
    </form>
  );
}
