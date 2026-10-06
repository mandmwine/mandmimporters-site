"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Swap the bytes behind an existing asset while keeping its ID so every wine
// that already references it keeps working.
export default function AssetReplaceUploader({ assetId }: { assetId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dims = await readDimensions(file);
      const fd = new FormData();
      fd.set("file", file);
      if (dims) {
        fd.set("width", String(dims.width));
        fd.set("height", String(dims.height));
      }
      const res = await fetch(`/catalog-admin/api/assets/${assetId}/replace`, {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Replace failed.");
      }
      start(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="uploader">
      <label className="btn small">
        {busy || pending ? "Uploading…" : "Replace file"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={onSelect}
          disabled={busy || pending}
          style={{ display: "none" }}
        />
      </label>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
