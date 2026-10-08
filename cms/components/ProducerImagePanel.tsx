"use client";
// Phase 41 (Sprint 3) — producer logo + hero image slot.
//
// Shows the current image bound to a producer in a given role (logo or
// hero), lets the user upload a replacement, pick from the asset library,
// or clear the slot. Replaces nothing — the producer workspace continues
// to render its text fields through EditableProducer; this is a second
// panel next to it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AssetUploader from "./AssetUploader";
import { setProducerAsset } from "@/lib/actions";

type RecentAsset = {
  id: string;
  file_name: string | null;
  width_px: number | null;
  height_px: number | null;
};

export default function ProducerImagePanel({
  producerId,
  role,
  roleLabel,
  roleHint,
  currentAssetId,
  currentAssetSignedUrl,
  recentAssets,
}: {
  producerId: string;
  role: "logo" | "hero";
  roleLabel: string;
  roleHint: string;
  currentAssetId: string | null;
  currentAssetSignedUrl: string | null;
  recentAssets: RecentAsset[];
}) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function assign(assetId: string | null) {
    setError(null);
    const fd = new FormData();
    fd.set("producer_id", producerId);
    fd.set("role", role);
    if (assetId) fd.set("asset_id", assetId);
    start(async () => {
      const res = await setProducerAsset(fd);
      if (!res.ok) {
        setError(res.message ?? "Could not save.");
        return;
      }
      router.refresh();
      setPicking(false);
    });
  }

  return (
    <div className="panel producer-image">
      <div className="panel-head">
        <h2>{roleLabel}</h2>
      </div>
      <p className="small muted producer-image__hint">{roleHint}</p>

      <div className={`producer-image__preview producer-image__preview--${role}`}>
        {currentAssetSignedUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={currentAssetSignedUrl} alt={`${roleLabel} preview`} />
        ) : (
          <div className="producer-image__empty">No {roleLabel.toLowerCase()} yet</div>
        )}
      </div>

      <div className="producer-image__actions">
        <AssetUploader
          defaultKind={role === "logo" ? "logo" : "photo"}
          setAsBottle={false}
          onUploaded={(id) => assign(id)}
          compact
        />
        {recentAssets.length > 0 && (
          <button type="button" className="btn small" onClick={() => setPicking((v) => !v)}>
            {picking ? "Hide library" : "Choose from library"}
          </button>
        )}
        {currentAssetId && (
          <button
            type="button"
            className="link small muted"
            disabled={pending}
            onClick={() => assign(null)}
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="error small">{error}</p>}

      {picking && (
        <div className="producer-image__library">
          <ul>
            {recentAssets.map((a) => (
              <li key={a.id} className={a.id === currentAssetId ? "selected" : undefined}>
                <button type="button" onClick={() => assign(a.id)} disabled={pending}>
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
