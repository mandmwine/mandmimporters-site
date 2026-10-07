"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "./useEscClose";
import { addVintage } from "@/lib/actions";

export default function AddVintageButton({ wineId, hasExisting }: { wineId: string; hasExisting: boolean }) {
  const [open, setOpen] = useState(false);
  const [vintage, setVintage] = useState("");
  const [duplicate, setDuplicate] = useState(hasExisting);
  const [addAnother, setAddAnother] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEscClose(open, () => setOpen(false));

  function doSubmit(keepOpen: boolean) {
    start(async () => {
      const fd = new FormData();
      fd.set("wine_id", wineId);
      if (vintage.trim()) fd.set("vintage_text", vintage.trim());
      if (duplicate) fd.set("duplicate", "on");
      await addVintage(fd);
      router.refresh();
      if (keepOpen) {
        setVintage("");
        // keep the dialog open for another entry
      } else {
        setOpen(false);
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit(addAnother);
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
      <label className="checkbox small" title="Keep this form open after save so you can add another vintage">
        <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
        Add another
      </label>
      <button className="btn primary small" type="submit" disabled={pending}>
        {pending ? "Adding…" : addAnother ? "Add + another" : "Add"}
      </button>
      <button type="button" className="link small" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
