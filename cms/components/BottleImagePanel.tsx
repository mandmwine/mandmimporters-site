"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AssetUploader from "./AssetUploader";
import { setBottleAsset } from "@/lib/actions";

type Asset = {
  id: string;
  file_name: string | null;
  width_px: number | null;
  height_px: number | null;
  mime_type: string | null;
};

export default function BottleImagePanel({
  wineVintageId,
  currentAssetId,
  recentAssets,
  fallbackImage,          // from legacy.img — only shown when no asset chosen
  resolutionWarning,      // "low" | "ok" | null
}: {
  wineVintageId: string;
  currentAssetId: string | null;
  recentAssets: Asset[];
  fallbackImage: string | null;
  resolutionWarning: "low" | "ok" | null;
}) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

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

      <div className="bottle-panel__meta small muted">
        {currentAssetId
          ? "Uploaded asset — used in exports"
          : fallbackImage
          ? "Falling back to the website image"
          : "No image set"}
        {resolutionWarning === "low" && (
          <div className="warn-text">Low resolution — may be blurry when printed.</div>
        )}
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
