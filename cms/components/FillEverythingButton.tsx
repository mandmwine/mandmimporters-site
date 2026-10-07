"use client";
// One-click "✦ Fill everything from Claude" button.
//
// Fires four Claude proposals in parallel for a single wine vintage:
//   1. Draft tasting note          — from the wine's own data
//   2. Find critic scores          — web search
//   3. Fill vintage details        — web search (aging, grapes, mevushal, designation)
//   4. Producer bio (short)        — web search, only if empty
//
// Each proposal lands as its own card in the AIProposalsPanel at the top of
// the wine page. The user approves them individually.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  proposeFillVintageDetails,
  proposeFindScores,
  proposeProducerBio,
  proposeTastingNote,
  type ProposeResult,
} from "@/lib/ai-actions";

type Task =
  | { key: "tasting_note"; label: "Tasting note"; }
  | { key: "scores"; label: "Critic scores"; }
  | { key: "vintage_details"; label: "Technical details"; }
  | { key: "producer_bio"; label: "Producer bio"; };

type TaskState = {
  status: "pending" | "running" | "done" | "error" | "skipped";
  error?: string;
  resultId?: string;
};

const TASK_DEFS: Task[] = [
  { key: "tasting_note", label: "Tasting note" },
  { key: "scores", label: "Critic scores" },
  { key: "vintage_details", label: "Technical details" },
  { key: "producer_bio", label: "Producer bio" },
];

export default function FillEverythingButton({
  wineVintageId,
  producerId,
  skipProducerBio,
  skipTastingNote,
  compact,
}: {
  wineVintageId: string;
  producerId: string;
  // When the producer already has a bio, skip that task to save an API call.
  skipProducerBio?: boolean;
  // When the wine already has a tasting note, skip drafting a new one.
  skipTastingNote?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [states, setStates] = useState<Record<string, TaskState>>({});
  const router = useRouter();

  function initial(): Record<string, TaskState> {
    const s: Record<string, TaskState> = {};
    for (const t of TASK_DEFS) {
      if (t.key === "producer_bio" && skipProducerBio) s[t.key] = { status: "skipped" };
      else if (t.key === "tasting_note" && skipTastingNote) s[t.key] = { status: "skipped" };
      else s[t.key] = { status: "pending" };
    }
    return s;
  }

  async function fire(task: Task): Promise<ProposeResult> {
    const fd = new FormData();
    if (task.key === "producer_bio") fd.set("producer_id", producerId);
    else fd.set("wine_vintage_id", wineVintageId);
    switch (task.key) {
      case "tasting_note": return proposeTastingNote(fd);
      case "scores": return proposeFindScores(fd);
      case "vintage_details": return proposeFillVintageDetails(fd);
      case "producer_bio": return proposeProducerBio(fd);
    }
  }

  function run() {
    const s0 = initial();
    setStates(s0);
    setOpen(true);
    start(async () => {
      // Fire all un-skipped tasks concurrently; update per-task state as each lands.
      await Promise.all(
        TASK_DEFS.map(async (t) => {
          if (s0[t.key].status === "skipped") return;
          setStates((prev) => ({ ...prev, [t.key]: { status: "running" } }));
          try {
            const result = await fire(t);
            setStates((prev) => ({
              ...prev,
              [t.key]: result.ok
                ? { status: "done", resultId: result.id }
                : { status: "error", error: result.error },
            }));
          } catch (err) {
            setStates((prev) => ({
              ...prev,
              [t.key]: { status: "error", error: err instanceof Error ? err.message : String(err) },
            }));
          }
        }),
      );
      // Refresh the page so the proposals panel picks up the new rows.
      router.refresh();
    });
  }

  const anyDone = Object.values(states).some((s) => s.status === "done");
  const anyRunning = Object.values(states).some((s) => s.status === "running");

  return (
    <>
      <button
        type="button"
        className={compact ? "btn small primary" : "btn primary"}
        onClick={run}
        disabled={pending}
        title="Ask Claude to fill in everything — tasting note, scores, technical details, and producer bio — in parallel."
      >
        {pending ? "✦ Thinking…" : "✦ Fill everything from Claude"}
      </button>
      {open && (
        <div className="fill-everything-status">
          <strong className="small">
            {anyRunning ? "Claude is working…" : anyDone ? "Proposals ready" : "Done"}
          </strong>
          <ul className="plain-list small">
            {TASK_DEFS.map((t) => {
              const s = states[t.key] ?? { status: "pending" };
              return (
                <li key={t.key}>
                  <span className={`fill-dot fill-dot--${s.status}`} aria-hidden />
                  <span>{t.label}</span>
                  {s.status === "skipped" && <span className="muted small"> — already filled</span>}
                  {s.status === "error" && <span className="error small"> — {s.error}</span>}
                  {s.status === "done" && <span className="muted small"> — ready to review ↓</span>}
                </li>
              );
            })}
          </ul>
          {!anyRunning && (
            <button className="link small muted" type="button" onClick={() => setOpen(false)}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  );
}
