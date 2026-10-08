"use client";
import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { clientAuth, firebaseClientConfigured } from "@/lib/firebase-client";

// Firebase Auth error codes → plain-English messages. If no match, we show
// the raw code in parens so an admin can diagnose unfamiliar errors.
const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
  "auth/user-disabled": "This account has been disabled on the Firebase side.",
  "auth/user-not-found": "No Firebase account for that email. If you're the owner, create one in the Firebase console first.",
  "auth/wrong-password": "Password is incorrect.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/popup-blocked": "A sign-in popup was blocked by the browser. Try again, or allow popups for this site.",
};

// Phase 36 — DenyCode from /api/session, each with a plain-English fallback
// (the server also sends `message`, but keeping these here lets us tailor
// the UX next to the field — e.g. a suggested Reset Password link).
const SERVER_HINTS: Record<string, string> = {
  server_not_configured: "Firebase or the database isn't set up on this environment yet.",
  missing_token: "Browser didn't attach the sign-in token. Reload and try again.",
  token_unverifiable: "Firebase rejected the sign-in token. Reload the page and try again.",
  sign_in_stale: "The sign-in took longer than 5 minutes. Reload and try once more.",
  unknown_email: "No catalog account for that email.",
  account_inactive: "The catalog account is marked inactive.",
  bootstrap_blocked: "BOOTSTRAP_ADMIN_EMAIL doesn't fit the current state. Check it against your Firebase email.",
  server_error: "A database error happened. Check Settings → System once you can sign in.",
};

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!firebaseClientConfigured) {
    return <p className="notice">Sign-in is not configured yet. Firebase settings still need to be added in Vercel.</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const auth = clientAuth();
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/catalog-admin/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      await signOut(auth);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string; email?: string };
      if (!res.ok || !body.ok) {
        // Phase 36 — show the server's `message` plus a hint tied to the
        // `code` field so the user knows what to do, not just what went wrong.
        const hint = body.code ? SERVER_HINTS[body.code] : null;
        const full = body.message
          ? (hint && hint !== body.message ? `${body.message}` : body.message)
          : "Sign-in failed.";
        setError(full + (body.code ? ` (code: ${body.code})` : ""));
        setBusy(false);
        return;
      }
      window.location.assign("/catalog-admin");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      const base = FIREBASE_MESSAGES[code] ?? "Sign-in failed. Please try again.";
      setError(code && !FIREBASE_MESSAGES[code] ? `${base} (Firebase code: ${code})` : base);
      setBusy(false);
    }
  }

  async function onReset() {
    setError(null);
    if (!email.trim()) {
      setError("Enter your email first, then choose Forgot password.");
      return;
    }
    try {
      await sendPasswordResetEmail(clientAuth(), email.trim());
    } catch {
      /* Don't reveal whether the address exists. */
    }
    setNotice("If that address has an account, a reset link is on its way.");
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" className="link" onClick={onReset}>
        Forgot password
      </button>
    </form>
  );
}
