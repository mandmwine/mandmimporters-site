"use client";
// Phase 16: the unlock form the public share page shows when password_hash is set.
// Submits to /share/catalog/<token>/unlock as a plain form POST so the server
// can set the unlock cookie on the redirect response.
export default function UnlockShareForm({ token }: { token: string }) {
  return (
    <form method="POST" action={`/catalog-admin/share/catalog/${token}/unlock`} className="form-grid">
      <label>
        Passphrase
        <input name="password" type="password" autoFocus required autoComplete="current-password" />
      </label>
      <div className="form-actions">
        <button className="btn primary" type="submit">Open catalog</button>
      </div>
    </form>
  );
}
