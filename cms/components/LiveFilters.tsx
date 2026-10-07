"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  basePath: string;              // e.g. "/wines"
  q: string;
  status: string;
  country: string;
  missing: string;
  countries: { name: string }[];
  statuses: [string, string][];  // [value, label]
  missings: [string, string][];
};

// Combined search + filter row.  Search is debounced (300ms) so a user can
// type freely without clicking anything; filter dropdowns submit immediately.
// All state lives in the URL so refresh and share work.
export default function LiveFilters({
  basePath,
  q,
  status,
  country,
  missing,
  countries,
  statuses,
  missings,
}: Props) {
  const router = useRouter();
  const [qInput, setQInput] = useState(q);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  // Debounced push to router when the search box changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPending(true);
      router.push(buildHref({ q: qInput, status, country, missing }, basePath));
      // Let React/Next re-render; the router.push is synchronous for the push
      // itself, the data-fetching happens afterwards.
      setTimeout(() => setPending(false), 200);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qInput, status, country, missing, basePath, router]);

  function change(name: "status" | "country" | "missing", value: string) {
    const next = { q: qInput, status, country, missing, [name]: value };
    router.push(buildHref(next, basePath));
  }

  const anyActive = Boolean(qInput || status || country || missing);

  return (
    <div className="filters">
      <input
        name="q"
        placeholder="Search wine, producer, appellation, vintage"
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQInput("");
          }
        }}
      />
      <select value={status} onChange={(e) => change("status", e.target.value)}>
        {[["", "Any status"], ...statuses].map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select value={country} onChange={(e) => change("country", e.target.value)}>
        <option value="">Any country</option>
        {countries.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <select value={missing} onChange={(e) => change("missing", e.target.value)}>
        {[["", "Any completeness"], ...missings].map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {pending && <span className="small muted" aria-live="polite">Searching…</span>}
      {anyActive && (
        <button
          type="button"
          className="link small"
          onClick={() => {
            setQInput("");
            router.push(basePath);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function buildHref(
  s: { q: string; status: string; country: string; missing: string },
  base: string,
): string {
  const u = new URLSearchParams();
  if (s.q) u.set("q", s.q);
  if (s.status) u.set("status", s.status);
  if (s.country) u.set("country", s.country);
  if (s.missing) u.set("missing", s.missing);
  const qs = u.toString();
  return qs ? `${base}?${qs}` : base;
}
