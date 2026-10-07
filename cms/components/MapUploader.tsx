"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMapVersion } from "@/lib/actions";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — GeoJSON can be big

// Dual-input: pick a .geojson/.json file OR paste the JSON into the textarea.
// Server validates either way via lib/actions.ts createMapVersion.
export default function MapUploader({ locationId, locationName }: { locationId: string; locationName: string }) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit(text: string) {
    setError(null);
    setInfo(null);
    start(async () => {
      const fd = new FormData();
      fd.set("location_id", locationId);
      fd.set("geojson", text);
      const res = await createMapVersion(fd);
      if (!res.ok) {
        setError(res.message ?? "Failed to save GeoJSON.");
        return;
      }
      setInfo(`Saved as a new draft version for ${locationName}.`);
      setRaw("");
      router.refresh();
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    if (file.size > MAX_BYTES) {
      setError(`File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      submit(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = raw.trim();
    if (!t) {
      setError("Paste GeoJSON before saving.");
      return;
    }
    submit(t);
  }

  return (
    <div className="map-uploader">
      <div className="map-uploader__tabs chips">
        <button
          type="button"
          className={mode === "paste" ? "active" : undefined}
          onClick={() => setMode("paste")}
        >
          Paste GeoJSON
        </button>
        <button
          type="button"
          className={mode === "upload" ? "active" : undefined}
          onClick={() => setMode("upload")}
        >
          Upload file
        </button>
      </div>

      {mode === "paste" ? (
        <form className="form-grid" onSubmit={onPasteSubmit}>
          <label>
            GeoJSON
            <textarea
              rows={10}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'{"type":"FeatureCollection","features":[…]}'}
              className="mono small"
            />
            <span className="small muted">
              A FeatureCollection, Feature, Polygon, or MultiPolygon. Each feature should have{" "}
              <code>properties.name</code> so the sheet can highlight it by name.
            </span>
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save as draft"}
            </button>
          </div>
        </form>
      ) : (
        <div className="form-grid">
          <label className="btn primary">
            {pending ? "Uploading…" : "Choose .geojson file"}
            <input
              ref={inputRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={onFile}
              disabled={pending}
              style={{ display: "none" }}
            />
          </label>
          <p className="small muted">
            Max 10 MB. Common free sources: Natural Earth, geoBoundaries, OpenStreetMap via Overpass,
            or hand-drawn in <a href="https://geojson.io" target="_blank" rel="noreferrer">geojson.io</a>.
          </p>
        </div>
      )}

      {error && <p className="error small">{error}</p>}
      {info && <p className="ok small">{info}</p>}
    </div>
  );
}
