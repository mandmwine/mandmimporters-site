"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "./useEscClose";
import { deleteAsset } from "@/lib/actions";

export default function AssetDeleteButton({ id, usedCount }: { id: string; usedCount: number }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  useEscClose(confirming, () => setConfirming(false));

  function onDelete() {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await deleteAsset(fd);
      router.push("/assets");
    });
  }

  if (!confirming) {
    return (
      <button type="button" className="btn danger small" onClick={() => setConfirming(true)}>
        Delete asset
      </button>
    );
  }
  return (
    <div className="confirm-row">
      <span className="small">
        {usedCount > 0
          ? `This asset is used by ${usedCount} wine${usedCount === 1 ? "" : "s"}. Delete anyway?`
          : "Delete this asset?"}
      </span>
      <button type="button" className="btn danger small" onClick={onDelete} disabled={pending}>
        {pending ? "Deleting…" : "Confirm delete"}
      </button>
      <button type="button" className="link small" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
    </div>
  );
}
