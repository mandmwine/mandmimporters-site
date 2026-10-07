"use client";
// Compact archive button that lives on the right of a wine row. Click it and
// a tiny inline confirm pops up next to it; click again to archive the vintage.
// Second click bubbles up — stopPropagation keeps the surrounding
// ClickableRow from navigating when the user is interacting with the button.
import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { archiveWineVintage } from "@/lib/actions";

export default function InlineArchiveButton({
  vintageId,
  label,
}: {
  vintageId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function stop(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }
  function openConfirm(e: MouseEvent) {
    stop(e);
    setConfirming(true);
  }
  function cancel(e: MouseEvent) {
    stop(e);
    setConfirming(false);
  }
  function doArchive(e: MouseEvent) {
    stop(e);
    const fd = new FormData();
    fd.set("id", vintageId);
    start(async () => {
      await archiveWineVintage(fd);
      router.refresh();
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="inline-archive"
        onClick={openConfirm}
        title={`Archive ${label}`}
        aria-label={`Archive ${label}`}
      >
        Archive
      </button>
    );
  }
  return (
    <span className="inline-archive-confirm" onClick={stop}>
      <button type="button" className="inline-archive inline-archive--danger" onClick={doArchive} disabled={pending}>
        {pending ? "…" : "Confirm"}
      </button>
      <button type="button" className="link small" onClick={cancel} disabled={pending}>
        Cancel
      </button>
    </span>
  );
}
