"use client";
// Phase 31 — The six office UX acceptance tests from audit §44, rendered
// as cards you can walk a nontechnical tester through task by task.
//
// Each test has: the ASK (what you read aloud, verbatim), the PASS
// condition (what you watch for), a status (not started / passed /
// failed / blocked), and a notes field. Results live in localStorage
// under a per-browser key so a run survives page navigations.
//
// A top summary + Reset + Export-as-Markdown round out the UX. The export
// drops a .md file into the user's downloads so they can attach a run to
// an email or paste it into a brief without hand-copying.
import { useEffect, useState, useTransition } from "react";
import { saveUXTestRun } from "@/lib/actions";

type Status = "not_started" | "passed" | "failed" | "blocked";

type Test = {
  key: string;
  n: number;
  ask: string;
  pass_condition: string;
  hint?: string;
};

const TESTS: Test[] = [
  {
    key: "t1",
    n: 1,
    ask: "Change the tasting note.",
    pass_condition: "They find it immediately.",
  },
  {
    key: "t2",
    n: 2,
    ask: "Add or change the bottle image.",
    pass_condition: "They find the image workflow without navigating to a technical asset-management screen.",
  },
  {
    key: "t3",
    n: 3,
    ask: "Add a score.",
    pass_condition: "They understand where scores live.",
  },
  {
    key: "t4",
    n: 4,
    ask: "Make a PDF containing these five wines.",
    pass_condition: "They select wines and reach export without explanation.",
    hint: "Pre-pick five wines from the Wines list before you start, so the tester starts fresh at the list.",
  },
  {
    key: "t5",
    n: 5,
    ask: "Make the same wines into a Trade catalog.",
    pass_condition: "They understand the presentation choice.",
  },
  {
    key: "t6",
    n: 6,
    ask: "Find out why this wine is not ready.",
    pass_condition: "The interface tells them in plain English.",
    hint: "Pick a wine with at least one problem — missing bottle, low-res image, no tasting note, or open review items.",
  },
];

type RunState = {
  run_name: string;
  started_at: string;
  results: Record<string, { status: Status; notes: string }>;
};

const STORAGE_KEY = "mm.ux_acceptance_run.v1";

function emptyRun(): RunState {
  return {
    run_name: "",
    started_at: new Date().toISOString(),
    results: Object.fromEntries(TESTS.map((t) => [t.key, { status: "not_started", notes: "" }])),
  };
}

export default function UXAcceptanceTests() {
  const [run, setRun] = useState<RunState | null>(null);
  const [savePending, startSave] = useTransition();
  const [saveState, setSaveState] = useState<"idle" | "ok" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Hydrate from localStorage after mount so SSR doesn't choke on window.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RunState;
        // Backfill any new tests added since this run started.
        for (const t of TESTS) {
          if (!parsed.results[t.key]) parsed.results[t.key] = { status: "not_started", notes: "" };
        }
        setRun(parsed);
        return;
      }
    } catch {
      // ignore and start fresh
    }
    setRun(emptyRun());
  }, []);

  // Persist on every change (debouncing isn't worth the complexity here —
  // the state object is tiny and runs are low-frequency).
  useEffect(() => {
    if (!run) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    } catch {
      // storage full or private browsing — the UI still works for this session.
    }
  }, [run]);

  if (!run) {
    return <p className="muted small">Loading…</p>;
  }

  function setStatus(key: string, status: Status) {
    setRun((r) => (r ? { ...r, results: { ...r.results, [key]: { ...r.results[key], status } } } : r));
  }
  function setNotes(key: string, notes: string) {
    setRun((r) => (r ? { ...r, results: { ...r.results, [key]: { ...r.results[key], notes } } } : r));
  }
  function setRunName(name: string) {
    setRun((r) => (r ? { ...r, run_name: name } : r));
  }

  function startNewRun() {
    if (confirm("Start a new run? This clears all current results.")) {
      setRun(emptyRun());
      setSaveState("idle");
      setSaveMessage(null);
    }
  }

  // Phase 42 — persist the completed run to the server. Separate from
  // Export-as-Markdown so a run can be saved to history AND emailed to
  // a stakeholder. The server computes counts + the accepted boolean
  // independently so the client can't mis-report a pass.
  function finishAndSave() {
    if (!run) return;
    const results = TESTS.map((t) => {
      const r = run.results[t.key];
      return {
        testId: t.key,
        title: t.ask,
        status: r.status,
        neededHelp: false, // Not captured in the harness UI yet — see Phase 42 note.
        notes: r.notes || null,
      };
    });
    setSaveState("idle");
    setSaveMessage(null);
    startSave(async () => {
      const res = await saveUXTestRun({
        testerName: run.run_name || null,
        appVersion: null,
        startedAt: run.started_at,
        results,
      });
      if (!res.ok) {
        setSaveState("error");
        setSaveMessage(res.message ?? "Save failed.");
        return;
      }
      setSaveState("ok");
      setSaveMessage("Saved. History visible under Settings → UX tests → History.");
    });
  }

  function exportMarkdown() {
    if (!run) return;
    const dt = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const lines: string[] = [];
    lines.push(`# Office UX Acceptance Test Run`);
    lines.push(``);
    if (run.run_name) lines.push(`**Tester:** ${run.run_name}  `);
    lines.push(`**Started:** ${new Date(run.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}  `);
    lines.push(`**Reported:** ${dt}  `);
    lines.push(``);
    lines.push(`## Summary`);
    lines.push(``);
    lines.push(`- Passed: ${counts(run).passed} / ${TESTS.length}`);
    lines.push(`- Failed: ${counts(run).failed}`);
    lines.push(`- Blocked: ${counts(run).blocked}`);
    lines.push(`- Not run: ${counts(run).not_started}`);
    lines.push(``);
    for (const t of TESTS) {
      const r = run.results[t.key];
      lines.push(`## Test ${t.n}: ${t.ask}`);
      lines.push(``);
      lines.push(`**Pass condition:** ${t.pass_condition}  `);
      lines.push(`**Result:** ${labelOf(r.status)}`);
      if (r.notes.trim()) {
        lines.push(``);
        lines.push(`${r.notes.trim()}`);
      }
      lines.push(``);
    }
    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = run.run_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "run";
    a.download = `ux-acceptance-${safe}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const c = counts(run);

  return (
    <div className="ux-tests">
      <div className="panel ux-tests__summary">
        <div className="ux-tests__summary-row">
          <label className="ux-tests__name">
            Tester (optional)
            <input
              type="text"
              placeholder="e.g. Maria, our bookkeeper"
              value={run.run_name}
              onChange={(e) => setRunName(e.target.value)}
            />
          </label>
          <div className="ux-tests__scoreboard">
            <ScorePill n={c.passed}      label="Passed" tone="ok" />
            <ScorePill n={c.failed}      label="Failed" tone="err" />
            <ScorePill n={c.blocked}     label="Blocked" tone="warn" />
            <ScorePill n={c.not_started} label="Not run" tone="mute" />
          </div>
          <div className="ux-tests__actions">
            <button type="button" className="btn primary small" onClick={finishAndSave} disabled={savePending}>
              {savePending ? "Saving…" : "Finish & save to history"}
            </button>
            <button type="button" className="btn small" onClick={exportMarkdown}>
              Export as Markdown
            </button>
            <button type="button" className="link small muted" onClick={startNewRun}>
              Reset run
            </button>
          </div>
          {saveState === "ok" && saveMessage && (
            <p className="small ok-text">{saveMessage}</p>
          )}
          {saveState === "error" && saveMessage && (
            <p className="small error">{saveMessage}</p>
          )}
        </div>
        <p className="small muted ux-tests__started">
          Started {new Date(run.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ·
          Saved in this browser only.
        </p>
      </div>

      {TESTS.map((t) => {
        const r = run.results[t.key];
        return (
          <div key={t.key} className={`panel ux-test ux-test--${r.status}`}>
            <div className="ux-test__head">
              <h2>Test {t.n}</h2>
              <StatusPicker value={r.status} onChange={(s) => setStatus(t.key, s)} />
            </div>
            <blockquote className="ux-test__ask">&ldquo;{t.ask}&rdquo;</blockquote>
            <p className="small ux-test__pass">
              <strong>Pass condition.</strong> {t.pass_condition}
            </p>
            {t.hint && (
              <p className="small muted ux-test__hint">
                <strong>Prep:</strong> {t.hint}
              </p>
            )}
            <label className="ux-test__notes">
              Notes
              <textarea
                rows={3}
                placeholder="What they said, where they got stuck, what they looked for…"
                value={r.notes}
                onChange={(e) => setNotes(t.key, e.target.value)}
              />
            </label>
          </div>
        );
      })}

      <p className="small muted">
        If the tester needs verbal instruction, the workflow should be redesigned.
      </p>
    </div>
  );
}

function counts(run: RunState) {
  const out = { passed: 0, failed: 0, blocked: 0, not_started: 0 };
  for (const t of TESTS) {
    const s = run.results[t.key]?.status ?? "not_started";
    out[s]++;
  }
  return out;
}

function labelOf(s: Status): string {
  switch (s) {
    case "passed":  return "PASSED";
    case "failed":  return "FAILED";
    case "blocked": return "BLOCKED";
    case "not_started": return "not run";
  }
}

function ScorePill({ n, label, tone }: { n: number; label: string; tone: "ok" | "warn" | "err" | "mute" }) {
  return (
    <span className={`ux-tests__score ux-tests__score--${tone}`}>
      <strong>{n}</strong> <span className="muted small">{label}</span>
    </span>
  );
}

function StatusPicker({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const options: { s: Status; label: string }[] = [
    { s: "passed",      label: "Passed" },
    { s: "failed",      label: "Failed" },
    { s: "blocked",     label: "Blocked" },
    { s: "not_started", label: "Not run" },
  ];
  return (
    <div className="ux-test__picker" role="radiogroup" aria-label="Test result">
      {options.map((o) => (
        <button
          key={o.s}
          type="button"
          role="radio"
          aria-checked={value === o.s}
          className={`ux-test__pick ux-test__pick--${o.s} ${value === o.s ? "ux-test__pick--on" : ""}`}
          onClick={() => onChange(o.s)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
