"use client";
import { useEffect, useRef, useState, useTransition } from "react";
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
// Also acts as a drop zone — drop files anywhere on the page while this
// uploader is mounted and we grab them.
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
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const uploadedCount = useRef(0);

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

  async function uploadOne(file: File) {
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
    if (!res.ok || !body.ok) throw new Error(body.error ?? "Upload failed.");
    if (onUploaded && body.id) onUploaded(body.id);
    uploadedCount.current++;
  }

  async function uploadMany(files: File[]) {
    setError(null);
    setBusy(true);
    try {
      // Serial so we can show the current one as a preview and keep the request
      // volume predictable.
      for (const f of files) await uploadOne(f);
      start(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    await uploadMany(files);
  }

  // Global drag-over listener so a drop anywhere on the page triggers us.
  useEffect(() => {
    let depth = 0;
    function isFileDrag(ev: DragEvent): boolean {
      const dt = ev.dataTransfer;
      if (!dt) return false;
      // Chrome reports "Files" in types during drag over.
      return Array.from(dt.types).includes("Files");
    }
    function onEnter(e: DragEvent) {
      if (!isFileDrag(e)) return;
      depth++;
      setDragging(true);
    }
    function onLeave(e: DragEvent) {
      if (!isFileDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }
    function onOver(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) uploadMany(files);
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={compact ? "uploader uploader--compact" : "uploader"}>
        <label className="btn primary small">
          {busy || pending ? "Uploading…" : "Upload image"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={onSelect}
            disabled={busy || pending}
            style={{ display: "none" }}
          />
        </label>
        {preview && <img src={preview} alt="" className="uploader__preview" />}
        {error && <p className="error small">{error}</p>}
      </div>
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay__card">Drop image{" "}to upload</div>
        </div>
      )}
    </>
  );
}
