"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AssetUploader from "./AssetUploader";
import { useEscClose } from "./useEscClose";
import { setBottleAsset } from "@/lib/actions";

type Asset = {
  id: string;
  file_name: string | null;
  width_px: number | null;
  height_px: number | null;
  mime_type: string | null;
};

// Phase 28 — image-quality grade, computed and surfaced right next to the
// bottle in the workspace so a low-res photo is visible while editing, not
// only when preflight runs. The threshold matches the preflight warning
// (width < 800px → low-res); 1600px is "print-ready at 300dpi for a 5-inch
// bottle". Fatal is wasn't a workable export even on a half-column layout.
export type BottleQuality =
  | { kind: "missing" }
  | { kind: "fallback_only" }
  | { kind: "no_dimensions" }
  | { kind: "fatal"; width: number; height: number }
  | { kind: "low";   width: number; height: number }
  | { kind: "ok";    width: number; height: number }
  | { kind: "hi";    width: number; height: number };

export function gradeBottleQuality(
  currentAssetId: string | null,
  width: number | null,
  height: number | null,
  fallbackImage: string | null,
): BottleQuality {
  if (!currentAssetId) {
    return fallbackImage ? { kind: "fallback_only" } : { kind: "missing" };
  }
  if (!width || !height) return { kind: "no_dimensions" };
  if (width < 400) return { kind: "fatal", width, height };
  if (width < 800) return { kind: "low", width, height };
  if (width < 1600) return { kind: "ok", width, height };
  return { kind: "hi", width, height };
}

function qualityDotClass(q: BottleQuality): string {
  switch (q.kind) {
    case "hi":
    case "ok":
      return "bq-dot bq-dot--ok";
    case "low":
    case "fallback_only":
    case "no_dimensions":
      return "bq-dot bq-dot--warn";
    case "missing":
    case "fatal":
      return "bq-dot bq-dot--err";
  }
}

function qualityHeadline(q: BottleQuality): string {
  switch (q.kind) {
    case "hi":  return `Hi-res (${q.width}×${q.height})`;
    case "ok":  return `Standard (${q.width}×${q.height})`;
    case "low": return `Low-res (${q.width}×${q.height})`;
    case "fatal": return `Too small (${q.width}×${q.height})`;
    case "no_dimensions": return "Dimensions unknown";
    case "fallback_only": return "Using the website image";
    case "missing": return "No bottle image yet";
  }
}

function qualityDetail(q: BottleQuality): string {
  switch (q.kind) {
    case "hi":  return "Print-ready at any catalog layout.";
    case "ok":  return "Fine for every catalog layout we offer.";
    case "low": return "Looks fine on screen but may be soft on a printed detailed sheet. Upload a larger version if you have one.";
    case "fatal": return "Below our export minimum (400px). Please upload a larger version — any smartphone shot works.";
    case "no_dimensions": return "We can't tell the pixel size of this file. Export won't flag it as low-res, but check it after.";
    case "fallback_only": return "An uploaded photo takes precedence in exports; the website image is just a fallback.";
    case "missing": return "Catalogs that include this wine will show a placeholder. Upload a photo to replace it.";
  }
}

export default function BottleImagePanel({
  wineVintageId,
  currentAssetId,
  recentAssets,
  fallbackImage,          // from legacy.img — only shown when no asset chosen
  quality,                // Phase 28 — computed by the page server-side
}: {
  wineVintageId: string;
  currentAssetId: string | null;
  recentAssets: Asset[];
  fallbackImage: string | null;
  quality: BottleQuality;
}) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEscClose(picking, () => setPicking(false));

  function selectAsset(assetId: string | null) {
    const fd = new FormData();
    fd.set("wine_vintage_id", wineVintageId);
    if (assetId) fd.set("asset_id", assetId);
    start(async () => {
      await setBottleAsset(fd);
      router.refresh();
      setPicking(false);
    });
  }

  const displayedSrc = currentAssetId
    ? `/catalog-admin/api/assets/${currentAssetId}`
    : fallbackImage;

  return (
    <div className="bottle-panel">
      <div className="bottle-panel__preview">
        {displayedSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayedSrc} alt="Bottle" />
        ) : (
          <div className="bottle-panel__empty">No bottle image</div>
        )}
      </div>

      <div className={`bottle-panel__quality bq-${quality.kind}`}>
        <div className="bottle-panel__quality-head">
          <span className={qualityDotClass(quality)} aria-hidden />
          <strong>{qualityHeadline(quality)}</strong>
        </div>
        <p className="bottle-panel__quality-detail small muted">
          {qualityDetail(quality)}
        </p>
      </div>

      <div className="bottle-panel__actions">
        <AssetUploader
          wineVintageId={wineVintageId}
          defaultKind="bottle"
          setAsBottle
          compact
        />
        {recentAssets.length > 0 && (
          <button type="button" className="btn small" onClick={() => setPicking((p) => !p)}>
            {picking ? "Hide library" : "Choose from library"}
          </button>
        )}
        {currentAssetId && (
          <button
            type="button"
            className="link small muted"
            disabled={pending}
            onClick={() => selectAsset(null)}
          >
            Clear
          </button>
        )}
      </div>

      {picking && (
        <div className="bottle-library">
          <ul>
            {recentAssets.map((a) => (
              <li key={a.id} className={a.id === currentAssetId ? "selected" : undefined}>
                <button type="button" onClick={() => selectAsset(a.id)} disabled={pending}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/catalog-admin/api/assets/${a.id}`} alt={a.file_name ?? ""} />
                  <span className="small muted">
                    {a.width_px && a.height_px ? `${a.width_px}×${a.height_px}` : (a.file_name ?? "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
