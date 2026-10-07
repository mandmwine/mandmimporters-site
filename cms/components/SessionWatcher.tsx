"use client";
import { useEffect, useState } from "react";

// Pings a tiny health endpoint periodically to detect when the session
// cookie has expired (common after ~1h with Firebase).  Instead of letting
// the next click 302 to /login and lose unsaved work, we show a banner that
// offers "Sign in again" in a new tab, or lets the user keep typing.
const PING_MS = 60_000; // once a minute

export default function SessionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch("/catalog-admin/api/session/ping", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelled) {
          if (res.status === 401 || res.status === 403) setStale(true);
          else if (res.ok) setStale(false);
        }
      } catch {
        // Network blip — don't flip to stale from a single failed ping.
      }
    }
    const t = setInterval(ping, PING_MS);
    // Ping once ~15s after mount so a cold reload isn't noisy.
    const first = setTimeout(ping, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearTimeout(first);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="session-warning" role="alert">
      <strong>Your session has expired.</strong>
      <span>Any changes still showing on the page are local — sign in again to save them.</span>
      <a
        className="btn primary small"
        href="/catalog-admin/login"
        target="_blank"
        rel="noreferrer"
        onClick={() => setStale(false)}
      >
        Sign in →
      </a>
      <button
        type="button"
        className="link small muted"
        onClick={() => setStale(false)}
      >
        Dismiss
      </button>
    </div>
  );
}
