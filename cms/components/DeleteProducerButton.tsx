"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "./useEscClose";
import { deleteProducer } from "@/lib/actions";

// Two-click delete for a producer. Soft-deletes the producer, every wine, and
// every vintage. Only shown to admins; the action also enforces that server-side.
export default function DeleteProducerButton({
  id,
  wineCount,
  canDelete,
}: {
  id: string;
  wineCount: number;
  canDelete: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEscClose(confirming, () => setConfirming(false));

  if (!canDelete) return null;

  function doDelete() {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      const res = await deleteProducer(fd);
      if (!res.ok) {
        setError(res.message ?? "Delete failed.");
        return;
      }
      router.push("/producers");
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn danger small"
        onClick={() => setConfirming(true)}
      >
        Delete producer
      </button>
    );
  }

  return (
    <div className="confirm-row">
      <span className="small">
        Delete this producer and all {wineCount} wine{wineCount === 1 ? "" : "s"} underneath it?
        Soft-delete only — ask an engineer to restore from the audit log if you change your mind.
      </span>
      <button
        type="button"
        className="btn danger small"
        disabled={pending}
        onClick={doDelete}
      >
        {pending ? "Deleting…" : "Confirm delete"}
      </button>
      <button
        type="button"
        className="link small"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
