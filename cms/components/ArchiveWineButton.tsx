"use client";
// Phase 17: archive the current wine (soft-delete) and all its vintages.
// Two-click confirm. Unarchiving happens from /wines/archived.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveWine, archiveWineVintage } from "@/lib/actions";

export default function ArchiveWineButton({
  wineId,
  vintageId,
  vintageCount,
  wineDisplayName,
}: {
  wineId: string;
  vintageId: string;
  vintageCount: number;
  wineDisplayName: string;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<null | "wine" | "vintage">(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function archiveTheVintage() {
    setError(null);
    const fd = new FormData();
    fd.set("id", vintageId);
    start(async () => {
      const r = await archiveWineVintage(fd);
      if (!r.ok) { setError(r.message ?? "Archive failed."); return; }
      router.push("/wines");
    });
  }
  function archiveTheWine() {
    setError(null);
    const fd = new FormData();
    fd.set("id", wineId);
    start(async () => {
      const r = await archiveWine(fd);
      if (!r.ok) { setError(r.message ?? "Archive failed."); return; }
      router.push("/wines");
    });
  }

  if (!confirming) {
    return (
      <div className="archive-buttons" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn small" onClick={() => setConfirming("vintage")}>
          Archive this vintage
        </button>
        {vintageCount > 1 && (
          <button type="button" className="btn small" onClick={() => setConfirming("wine")}>
            Archive whole wine ({vintageCount} vintages)
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="confirm-row" style={{ marginTop: 8 }}>
      <span className="small">
        {confirming === "wine"
          ? <>Archive <strong>{wineDisplayName}</strong> and all {vintageCount} of its vintages? This is a soft-delete — restore from the Archived list.</>
          : <>Archive just this vintage? Other vintages of {wineDisplayName} stay published.</>}
      </span>
      <button type="button" className="btn danger small" disabled={pending}
        onClick={confirming === "wine" ? archiveTheWine : archiveTheVintage}>
        {pending ? "Archiving…" : "Yes, archive"}
      </button>
      <button type="button" className="link small" onClick={() => setConfirming(null)} disabled={pending}>
        Cancel
      </button>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
