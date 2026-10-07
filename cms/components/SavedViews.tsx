"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEscClose } from "./useEscClose";
import { createSavedView, deleteSavedView, toggleSavedViewPin } from "@/lib/actions";

export type SavedView = {
  id: string;
  name: string;
  path: string;    // "/wines"
  query: string;   // "?status=…"
  pinned: boolean;
};

type Props = {
  scope: "wines" | "catalogs" | "assets" | "producers" | "maps" | "review";
  views: SavedView[];
  anyFilter: boolean;    // only show "Save this view" when some filter is set
};

// Pinned saved views render as tabs along the top of a list; "+ Save view"
// opens a tiny inline form that captures the current URL and stores it under
// a user-supplied name.
export default function SavedViews({ scope, views, anyFilter }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEscClose(saving || showAll, () => { setSaving(false); setShowAll(false); });

  useEffect(() => { if (saving) inputRef.current?.focus(); }, [saving]);

  const currentQuery = (() => {
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();
  const activePath = `${path}${currentQuery}`;
  // Clean the user's basePath prefix so saved paths don't double it on reopen.
  const relativePath = path.startsWith("/catalog-admin")
    ? path.replace(/^\/catalog-admin/, "")
    : path;

  const pinned = views.filter((v) => v.pinned);
  const unpinned = views.filter((v) => !v.pinned);

  function doSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("scope", scope);
    fd.set("name", name.trim());
    fd.set("path", relativePath);
    fd.set("query", currentQuery);
    start(async () => {
      const r = await createSavedView(fd);
      if (!r.ok) { setError(r.message ?? "Save failed."); return; }
      setName("");
      setSaving(false);
      router.refresh();
    });
  }

  function act(fn: (fd: FormData) => Promise<unknown>, id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await fn(fd);
      router.refresh();
    });
  }

  const isCurrent = (v: SavedView) => `${v.path}${v.query}` === `${relativePath}${currentQuery}`;

  return (
    <div className="saved-views">
      <div className="saved-views__tabs">
        {pinned.map((v) => (
          <Link
            key={v.id}
            href={`${v.path}${v.query}`}
            className={`saved-view-tab${isCurrent(v) ? " active" : ""}`}
            title={`${v.path}${v.query}`}
          >
            {v.name}
          </Link>
        ))}
        {anyFilter && !saving && (
          <button
            type="button"
            className="saved-view-tab saved-view-tab--add"
            onClick={() => setSaving(true)}
          >
            + Save view
          </button>
        )}
        {views.length > 0 && (
          <button
            type="button"
            className="link small"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Hide saved" : `All saved (${views.length})`}
          </button>
        )}
      </div>

      {saving && (
        <form className="saved-views__form" onSubmit={doSave}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this view (e.g. &ldquo;Reds · needs review&rdquo;)"
            required
            maxLength={120}
          />
          <button type="submit" className="btn primary small" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="link small" onClick={() => setSaving(false)}>Cancel</button>
          {error && <span className="error small">{error}</span>}
        </form>
      )}

      {showAll && views.length > 0 && (
        <div className="saved-views__list">
          <ul className="plain-list small">
            {[...pinned, ...unpinned].map((v) => (
              <li key={v.id} className="saved-views__row">
                <Link href={`${v.path}${v.query}`} className={isCurrent(v) ? "strong" : ""}>
                  {v.name}
                </Link>
                <span className="muted mono small">{v.query || "(no filters)"}</span>
                <button
                  type="button"
                  className="link small"
                  onClick={() => act(toggleSavedViewPin, v.id)}
                  disabled={pending}
                >
                  {v.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  className="link small muted"
                  onClick={() => act(deleteSavedView, v.id)}
                  disabled={pending}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
