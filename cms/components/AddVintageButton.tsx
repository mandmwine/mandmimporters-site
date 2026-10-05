"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addVintage } from "@/lib/actions";

export default function AddVintageButton({ wineId, hasExisting }: { wineId: string; hasExisting: boolean }) {
  const [open, setOpen] = useState(false);
  const [vintage, setVintage] = useState("");
  const [duplicate, setDuplicate] = useState(hasExisting);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const fd = new FormData();
      fd.set("wine_id", wineId);
      if (vintage.trim()) fd.set("vintage_text", vintage.trim());
      if (duplicate) fd.set("duplicate", "on");
      await addVintage(fd);
      router.refresh();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        + Add vintage
      </button>
    );
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input
        type="text"
        placeholder="2024 or NV"
        value={vintage}
        onChange={(e) => setVintage(e.target.value)}
        required
        pattern="[0-9]{4}|NV|nv"
        autoFocus
      />
      {hasExisting && (
        <label className="checkbox small">
          <input type="checkbox" checked={duplicate} onChange={(e) => setDuplicate(e.target.checked)} />
          Copy from previous
        </label>
      )}
      <button className="btn primary small" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" className="link small" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
