"use client";
import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { clientAuth, firebaseClientConfigured } from "@/lib/firebase-client";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
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
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Sign-in failed.");
        setBusy(false);
        return;
      }
      window.location.assign("/catalog-admin");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(MESSAGES[code] ?? "Sign-in failed. Please try again.");
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
