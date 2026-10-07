"use client";
// Client component that drives repeated calls to seedMapsBatch (5 locations
// at a time, 1s/each) so the Vercel function timeout never bites. The user
// can start, pause, or resume. Each attempted location is logged inline so
// they can see exactly what hit and what didn't.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedMapsBatch, type SeedBatchResult } from "@/lib/actions";

type Attempt = SeedBatchResult["attempted"][number];

export default function SeedMapsPanel({ initialRemaining }: { initialRemaining: number }) {
  const [pending, start] = useTransition();
  const [log, setLog] = useState<Attempt[]>([]);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [scope, setScope] = useState<"needs_map" | "all_missing">("all_missing");
  const [stopRequested, setStopRequested] = useState(false);
  const router = useRouter();

  function tick(): Promise<SeedBatchResult> {
    const fd = new FormData();
    fd.set("limit", "5");
    fd.set("scope", scope);
    return seedMapsBatch(fd);
  }

  function run() {
    setRunning(true);
    setDone(false);
    setStopRequested(false);
    start(async () => {
      while (true) {
        const batch = await tick();
        setLog((prev) => [...prev, ...batch.attempted]);
        setRemaining(batch.remaining);
        if (batch.processed === 0 || batch.remaining === 0 || stopRequested) break;
      }
      setRunning(false);
      setDone(true);
      router.refresh();
    });
  }

  function stop() {
    setStopRequested(true);
  }

  function reset() {
    setLog([]);
    setDone(false);
    setStopRequested(false);
  }

  const totals = {
    seeded: log.filter((l) => l.status === "seeded").length,
    no_match: log.filter((l) => l.status === "no_match").length,
    error: log.filter((l) => l.status === "error").length,
    already: log.filter((l) => l.status === "already_had_version").length,
  };

  return (
    <div className="seed-maps">
      <div className="seed-maps__controls">
        <label className="small">
          <span className="muted">Scope:</span>{" "}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            disabled={running}
          >
            <option value="all_missing">
              Every location missing a map
            </option>
            <option value="needs_map">
              Only locations tagged “needs map”
            </option>
          </select>
        </label>
        {!running && !done && (
          <button type="button" className="btn primary" onClick={run} disabled={pending || remaining === 0}>
            {remaining === 0 ? "Nothing to seed" : `Seed ${remaining} location${remaining === 1 ? "" : "s"}`}
          </button>
        )}
        {running && (
          <button type="button" className="btn small" onClick={stop}>
            {stopRequested ? "Stopping after this batch…" : "Pause after this batch"}
          </button>
        )}
        {done && remaining > 0 && (
          <button type="button" className="btn primary" onClick={() => { reset(); run(); }}>
            Continue — {remaining} left
          </button>
        )}
      </div>

      {(running || log.length > 0) && (
        <div className="seed-maps__status small">
          <strong>{running ? "Running…" : "Done"}</strong>
          {" · "}
          <span className="ok-text">{totals.seeded} seeded</span>
          {totals.no_match > 0 && <> · <span className="muted">{totals.no_match} no match</span></>}
          {totals.error > 0 && <> · <span className="error">{totals.error} error</span></>}
          {remaining > 0 && <> · {remaining} left</>}
        </div>
      )}

      {log.length > 0 && (
        <ul className="seed-maps__log plain-list small">
          {log.slice(-80).reverse().map((a, i) => (
            <li key={`${a.location_id}-${i}`} className={`seed-maps__row seed-maps__row--${a.status}`}>
              <span className="seed-maps__badge">
                {a.status === "seeded" && "✓"}
                {a.status === "no_match" && "–"}
                {a.status === "error" && "×"}
                {a.status === "already_had_version" && "·"}
              </span>
              <strong>{a.name}</strong>
              {a.message && <span className="muted"> — {a.message}</span>}
              {a.source_url && (
                <> <a href={a.source_url} target="_blank" rel="noreferrer" className="link small">OSM ↗</a></>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
