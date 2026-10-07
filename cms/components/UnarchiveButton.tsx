"use client";
// Phase 17: restore an archived wine, vintage or producer.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unarchiveWine, unarchiveWineVintage, unarchiveProducer } from "@/lib/actions";

export default function UnarchiveButton({
  kind,
  id,
}: {
  kind: "wine" | "vintage" | "producer";
  id: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  function run() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      const action = kind === "wine" ? unarchiveWine
                   : kind === "vintage" ? unarchiveWineVintage
                   : unarchiveProducer;
      const r = await action(fd);
      if (!r.ok) { setError(r.message ?? "Restore failed."); return; }
      setDone(true);
      router.refresh();
    });
  }

  if (done) return <span className="ok-text small">Restored ✓</span>;
  return (
    <>
      <button type="button" className="btn small" onClick={run} disabled={pending}>
        {pending ? "Restoring…" : "Restore"}
      </button>
      {error && <span className="error small" style={{ marginLeft: 8 }}>{error}</span>}
    </>
  );
}
