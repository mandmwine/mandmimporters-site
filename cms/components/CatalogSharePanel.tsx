"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "./useEscClose";
import { createCatalogShare, revokeCatalogShare } from "@/lib/actions";

export type Share = {
  id: string;
  token: string;
  label: string | null;
  created_at: Date | string;
  created_by_email: string | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  view_count: number;
  last_viewed_at: Date | string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  has_password: boolean;
};

export default function CatalogSharePanel({
  catalogId,
  shares,
  basePath,
  canEdit,
}: {
  catalogId: string;
  shares: Share[];
  basePath: string; // e.g. "https://www.mandmimporters.com/catalog-admin"
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  useEscClose(showNew, () => setShowNew(false));
  useEffect(() => {
    if (showNew) formRef.current?.querySelector<HTMLInputElement>("input[name=label]")?.focus();
  }, [showNew]);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("catalog_id", catalogId);
    start(async () => {
      const r = await createCatalogShare(fd);
      if (!r.ok) {
        setError(r.message ?? "Failed to create share.");
        return;
      }
      setShowNew(false);
      router.refresh();
    });
  }

  function revoke(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await revokeCatalogShare(fd);
      router.refresh();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Older browsers: user can select the input to copy manually.
    }
  }

  const activeShares = shares.filter((s) => !s.revoked_at);
  const revokedShares = shares.filter((s) => s.revoked_at);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Share link</h2>
        {canEdit && (
          <button type="button" className="btn small" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Cancel" : "+ New link"}
          </button>
        )}
      </div>

      {showNew && (
        <form ref={formRef} className="attach-source form-grid" onSubmit={onCreate}>
          <label>
            Label (optional)
            <input name="label" placeholder="e.g. &ldquo;Spring 2026 — distributors&rdquo;" />
          </label>
          <fieldset className="form-fieldset">
            <legend>Who is this for? (optional)</legend>
            <label>
              Recipient name
              <input name="recipient_name" placeholder="e.g. Jane Smith, Breakthru Beverage" />
            </label>
            <label>
              Recipient email
              <input name="recipient_email" type="email" placeholder="jane@breakthrubev.com" />
              <span className="small muted">
                Named recipients let one link belong to one buyer, so view counts tell you who looked.
              </span>
            </label>
          </fieldset>
          <fieldset className="form-fieldset">
            <legend>Password (optional)</legend>
            <label>
              Passphrase
              <input name="password" type="text" autoComplete="off" placeholder="At least 4 characters" />
              <span className="small muted">
                Any recipient will be asked to type it once per browser before the catalog opens.
                Leaving this blank keeps the link token-only (same as before).
              </span>
            </label>
          </fieldset>
          <label>
            Expires on (optional)
            <input name="expires_at" type="date" />
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Minting…" : "Create link"}
            </button>
            {error && <span className="error small">{error}</span>}
          </div>
        </form>
      )}

      {activeShares.length === 0 && !showNew && (
        <p className="muted small">
          No active share links. Create one to let someone view this catalog without a login.
        </p>
      )}

      {activeShares.length > 0 && (
        <ul className="plain-list share-list">
          {activeShares.map((s) => {
            const url = `${basePath}/share/catalog/${s.token}`;
            return (
              <li key={s.id} className="share-row">
                <div className="share-row__meta">
                  <div className="strong">
                    {s.label || "Share link"}
                    {s.has_password && <span className="pill" title="Protected by passphrase">🔒</span>}
                  </div>
                  {(s.recipient_name || s.recipient_email) && (
                    <div className="small">
                      For <strong>{s.recipient_name ?? s.recipient_email}</strong>
                      {s.recipient_name && s.recipient_email && <span className="muted"> · {s.recipient_email}</span>}
                    </div>
                  )}
                  <div className="small muted">
                    {s.view_count} view{s.view_count === 1 ? "" : "s"}
                    {s.last_viewed_at && ` · last ${new Date(s.last_viewed_at).toLocaleDateString("en-US")}`}
                    {s.expires_at && ` · expires ${new Date(s.expires_at).toLocaleDateString("en-US")}`}
                    {" · "}created {new Date(s.created_at).toLocaleDateString("en-US")}
                    {s.created_by_email && ` by ${s.created_by_email}`}
                  </div>
                </div>
                <div className="share-row__url">
                  <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => copy(url)}
                  >
                    {copied === url ? "Copied" : "Copy"}
                  </button>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => revoke(s.id)}
                    disabled={pending}
                  >
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revokedShares.length > 0 && (
        <details className="small">
          <summary>Revoked links ({revokedShares.length})</summary>
          <ul className="plain-list small">
            {revokedShares.map((s) => (
              <li key={s.id} className="muted">
                {s.label || "Share link"} · revoked{" "}
                {s.revoked_at ? new Date(s.revoked_at).toLocaleDateString("en-US") : ""}
                {" · "}{s.view_count} views in its lifetime
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
