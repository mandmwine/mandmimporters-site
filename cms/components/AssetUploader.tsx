"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  wineVintageId?: string;    // when uploading from a wine's own page
  defaultKind?: "bottle" | "logo" | "photo" | "map" | "other";
  setAsBottle?: boolean;
  onUploaded?: (assetId: string) => void;
  compact?: boolean;
};

// Client-side image file picker. Reads width/height before posting so the
// resolution warning can be shown immediately and stored with the asset.
export default function AssetUploader({
  wineVintageId,
  defaultKind = "bottle",
  setAsBottle = true,
  onUploaded,
  compact,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
      setPreview(URL.createObjectURL(file));
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", defaultKind);
      if (wineVintageId) fd.set("wine_vintage_id", wineVintageId);
      if (setAsBottle) fd.set("set_as_bottle", "on");
      if (dims) {
        fd.set("width", String(dims.width));
        fd.set("height", String(dims.height));
      }
      const res = await fetch("/catalog-admin/api/assets", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Upload failed.");
      }
      if (onUploaded && body.id) onUploaded(body.id);
      start(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={compact ? "uploader uploader--compact" : "uploader"}>
      <label className="btn primary small">
        {busy || pending ? "Uploading…" : "Upload image"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={onSelect}
          disabled={busy || pending}
          style={{ display: "none" }}
        />
      </label>
      {preview && <img src={preview} alt="" className="uploader__preview" />}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
