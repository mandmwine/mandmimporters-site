"use client";
// Phase D — New Catalog wizard. Four live presentation cards after Phase 26
// shipped the Editorial renderer; Portfolio is still "coming soon".
//
// Step 1 — Presentation: Detailed · Editorial · Trade · Hybrid. Each key
//          maps to a backend render_mode the catalog renderer supports.
// Step 2 — Name + optional structure sections. The server action already
//          scaffolds a sensible default; this screen lets the user strip any
//          of them off before create.
// Step 3 — Review + create. Shows what will happen in one sentence, then
//          one big Create button.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelection } from "./SelectionProvider";
import { addWinesToCatalog, createCatalog } from "@/lib/actions";

type Preset = {
  key: "detailed" | "editorial" | "compact" | "hybrid";
  title: string;
  subtitle: string;
  description: string;
  hint: string;
  disabled?: boolean;
};

const PRESETS: Preset[] = [
  {
    key: "detailed",
    title: "Detailed",
    subtitle: "One wine per page",
    description: "A full data sheet for every wine — bottle, map, scores, technical table, tasting note.",
    hint: "Best for a sommelier catalog or a cellar reference.",
  },
  {
    key: "editorial",
    title: "Editorial",
    subtitle: "Two wines per page",
    description: "A reading-forward spread — bottle, big tasting note, one score. No technical table or map.",
    hint: "Best for a magazine-style catalog or storytelling piece.",
  },
  {
    key: "compact",
    title: "Trade",
    subtitle: "Multiple wines per page",
    description: "Dense buyer sheets. Smaller bottle, scores + facts side by side, 4-8 wines per page.",
    hint: "Best for distributors and quick portfolio reviews.",
  },
  {
    key: "hybrid",
    title: "Hybrid",
    subtitle: "Overview + detailed sheets",
    description: "A portfolio overview up front, then detailed sheets for every wine behind it.",
    hint: "The classic M&M master catalog shape — a book you'd keep.",
  },
];

type ExistingCatalog = { id: string; name: string; season: string | null };

export default function NewCatalogWizard({ existingCatalogs }: { existingCatalogs: ExistingCatalog[] }) {
  const sel = useSelection();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preset, setPreset] = useState<Preset["key"]>("hybrid");
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string>(existingCatalogs[0]?.id ?? "");
  const router = useRouter();

  function createNew() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    if (season.trim()) fd.set("season", season.trim());
    fd.set("render_mode", preset);
    fd.set("wine_vintage_ids", sel.selected.map((s) => s.id).join(","));
    start(async () => {
      try {
        await createCatalog(fd);
        sel.clear();
        // createCatalog redirects to /catalogs/<id>, so this line usually
        // doesn't run — but keep it for the "no wines yet" path.
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function addToExisting() {
    if (!existingId) return;
    setError(null);
    const fd = new FormData();
    fd.set("catalog_id", existingId);
    fd.set("wine_vintage_ids", sel.selected.map((s) => s.id).join(","));
    start(async () => {
      try {
        await addWinesToCatalog(fd);
        sel.clear();
        router.push(`/catalogs/${existingId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const hasWines = sel.count > 0;

  return (
    <div className="wizard">
      <ol className="wizard__stepper" aria-label="New catalog steps">
        <li className={`wizard__step ${step >= 1 ? "wizard__step--on" : ""}`}>
          <span className="wizard__step-num">1</span>
          <span className="wizard__step-label">Presentation</span>
        </li>
        <li className={`wizard__step ${step >= 2 ? "wizard__step--on" : ""}`}>
          <span className="wizard__step-num">2</span>
          <span className="wizard__step-label">Name &amp; structure</span>
        </li>
        <li className={`wizard__step ${step >= 3 ? "wizard__step--on" : ""}`}>
          <span className="wizard__step-num">3</span>
          <span className="wizard__step-label">Review</span>
        </li>
      </ol>

      {!hasWines && step === 1 && (
        <div className="wizard__notice">
          <strong>No wines selected yet.</strong>{" "}
          You can still pick a presentation and create a blank catalog — add
          wines from the <Link href="/wines">Wines</Link> list afterwards —
          or go select wines first and come back here.
        </div>
      )}

      {step === 1 && (
        <section className="wizard__panel">
          <h2 className="wizard__h">Pick a presentation</h2>
          <div className="wizard__cards">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`wizard-card ${preset === p.key ? "wizard-card--on" : ""}`}
                onClick={() => setPreset(p.key)}
                disabled={p.disabled}
                aria-pressed={preset === p.key}
              >
                <div className="wizard-card__title">{p.title}</div>
                <div className="wizard-card__subtitle">{p.subtitle}</div>
                <p className="wizard-card__description">{p.description}</p>
                <p className="wizard-card__hint">{p.hint}</p>
              </button>
            ))}
          </div>
          <div className="wizard__coming">
            Portfolio layout (producer-first spreads with a producer header + wine lineup) lands in a later pass.
          </div>
          <div className="wizard__actions">
            <Link href="/catalogs" className="link small">Cancel</Link>
            <button type="button" className="btn primary" onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard__panel">
          <h2 className="wizard__h">Name it</h2>
          <div className="form-grid" style={{ maxWidth: 520 }}>
            <label>
              Catalog name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2026 Master Catalog"
                autoFocus
              />
            </label>
            <label>
              Season <span className="muted small">(optional)</span>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="Fall 2026, 2026, Chanukah, etc."
              />
            </label>
            <p className="small muted" style={{ margin: 0 }}>
              We'll scaffold the standard sections — Cover, M&amp;M Intro, Contents, Regional Index, Wines, Producer Index, Contact, Back Cover.
              You can rearrange or delete any of them on the next screen.
            </p>
          </div>
          <div className="wizard__actions">
            <button type="button" className="link small" onClick={() => setStep(1)}>← Back</button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setStep(3)}
              disabled={!name.trim()}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="wizard__panel">
          <h2 className="wizard__h">Ready to go?</h2>
          <dl className="wizard__summary">
            <div><dt>Name</dt><dd>{name}{season ? <span className="muted small"> · {season}</span> : null}</dd></div>
            <div><dt>Presentation</dt><dd>{PRESETS.find((p) => p.key === preset)?.title}</dd></div>
            <div><dt>Wines</dt><dd>
              {hasWines
                ? `${sel.count} selected — all will be added to the Wines section.`
                : "None selected — the catalog will be empty; add wines from the Wines list afterwards."}
            </dd></div>
          </dl>
          <div className="wizard__actions">
            <button type="button" className="link small" onClick={() => setStep(2)}>← Back</button>
            <button type="button" className="btn primary" onClick={createNew} disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create catalog"}
            </button>
          </div>
          {error && <p className="error small">{error}</p>}

          {hasWines && existingCatalogs.length > 0 && (
            <div className="wizard__alt">
              <strong>Or add these {sel.count} wine{sel.count === 1 ? "" : "s"} to an existing catalog:</strong>
              <div className="wizard__alt-row">
                <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                  {existingCatalogs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.season ? ` · ${c.season}` : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" onClick={addToExisting} disabled={pending}>
                  Add to {existingCatalogs.find((c) => c.id === existingId)?.name ?? "catalog"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
