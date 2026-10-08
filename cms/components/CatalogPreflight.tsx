"use client";
// Phase D — preflight panel on the catalog detail page.
//
// Click Run preflight → the server walks the catalog's wines and returns a
// friendly report (warning / fatal counts, plain-language messages). The
// three export buttons appear below with the current warning count surfaced,
// so a user never clicks "Export" blind.
import { useState, useTransition } from "react";
import { preflightCatalog, type PreflightReport } from "@/lib/actions";

export default function CatalogPreflight({ catalogId }: { catalogId: string }) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const fd = new FormData();
    fd.set("catalog_id", catalogId);
    start(async () => {
      const r = await preflightCatalog(fd);
      if (!r.ok) { setError(r.message ?? "Preflight failed."); return; }
      setReport(r.report ?? null);
    });
  }

  const headline = report
    ? (report.fatals.length > 0
        ? "Can't export yet"
        : report.warnings.length === 0
          ? "All clear"
          : `${report.warnings.length} thing${report.warnings.length === 1 ? "" : "s"} worth knowing`)
    : null;

  return (
    <div className="panel preflight">
      <div className="panel-head">
        <h2>Preflight</h2>
        {!report && (
          <button type="button" className="btn small" onClick={run} disabled={pending}>
            {pending ? "Checking…" : "Run preflight"}
          </button>
        )}
        {report && (
          <button type="button" className="link small" onClick={run} disabled={pending}>
            {pending ? "Checking…" : "Re-run"}
          </button>
        )}
      </div>
      {!report && !error && (
        <p className="small muted">
          A one-click check of every wine in this catalog before you export.
          Flags missing bottle images, low-res images, missing scores, long
          tasting notes, and locations without an approved map.
        </p>
      )}
      {error && <p className="error small">{error}</p>}
      {report && (
        <>
          <div className={`preflight__headline preflight__headline--${report.fatals.length > 0 ? "fatal" : report.warnings.length === 0 ? "clear" : "warn"}`}>
            <strong>{headline}</strong>
            <span className="small muted">
              {report.wine_count} wine{report.wine_count === 1 ? "" : "s"} ·{" "}
              {report.bottle_ready}/{report.wine_count} with a bottle image
            </span>
          </div>

          {report.fatals.length > 0 && (
            <ul className="preflight__list preflight__list--fatal plain-list small">
              {report.fatals.map((f, i) => (
                <li key={i}><strong>{f.message}</strong></li>
              ))}
            </ul>
          )}

          {report.warnings.length > 0 && (
            <ul className="preflight__list plain-list small">
              {report.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}
          {report.warnings.length === 0 && report.fatals.length === 0 && (
            <p className="small muted">
              Every wine has a bottle, a tasting note and at least one score,
              every location has an approved map, and no copy is in danger of
              overflowing. You're good to export.
            </p>
          )}
        </>
      )}
    </div>
  );
}
