"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScore, deleteScore } from "@/lib/actions";

export type ScoreRow = {
  id: string;
  critic: string | null;
  score_text: string;
  award_text: string | null;
  is_primary: boolean;
  raw_text: string | null;
  review_year: number | null;
  review_url: string | null;
};

function ScoreForm({
  vintageId,
  initial,
  onDone,
  criticOptions,
}: {
  vintageId: string;
  initial?: ScoreRow;
  onDone: () => void;
  criticOptions: string[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("wine_vintage_id", vintageId);
    if (initial?.id) fd.set("id", initial.id);
    start(async () => {
      await saveScore(fd);
      router.refresh();
      onDone();
    });
  }

  return (
    <form className="score-form" onSubmit={submit}>
      <input
        name="critic"
        list="critic-list"
        placeholder="Critic (e.g. James Suckling)"
        defaultValue={initial?.critic ?? ""}
        required
      />
      <datalist id="critic-list">
        {criticOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <input
        name="score_text"
        placeholder="92 or 92-94"
        defaultValue={initial?.score_text ?? ""}
        required
      />
      <input name="award_text" placeholder="Gold (optional)" defaultValue={initial?.award_text ?? ""} />
      <input
        name="review_year"
        type="number"
        placeholder="Year"
        min={1990}
        max={2100}
        defaultValue={initial?.review_year ?? ""}
      />
      <input name="review_url" placeholder="Source URL (optional)" defaultValue={initial?.review_url ?? ""} />
      <textarea
        name="raw_text"
        placeholder="Quote (optional)"
        rows={2}
        defaultValue={initial?.raw_text ?? ""}
      />
      <label className="checkbox small">
        <input type="checkbox" name="is_primary" defaultChecked={initial?.is_primary ?? true} /> Primary (show on sheet)
      </label>
      <div className="score-form-actions">
        <button className="btn primary small" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="link small" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function ScoresPanel({
  vintageId,
  scores,
  criticOptions,
  canEdit,
}: {
  vintageId: string;
  scores: ScoreRow[];
  criticOptions: string[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onDelete(id: string) {
    if (!confirm("Delete this score?")) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("wine_vintage_id", vintageId);
    start(async () => {
      await deleteScore(fd);
      router.refresh();
    });
  }

  return (
    <div>
      {scores.length === 0 && !adding && <p className="muted">No scores for this vintage.</p>}
      <ul className="scores">
        {scores.map((s) =>
          editingId === s.id ? (
            <li key={s.id} className="score-row editing">
              <ScoreForm vintageId={vintageId} initial={s} onDone={() => setEditingId(null)} criticOptions={criticOptions} />
            </li>
          ) : (
            <li key={s.id} className="score-row">
              <span className="score">{s.score_text}</span>
              <span>{s.critic ?? "Unknown critic"}</span>
              {s.award_text && <span className="muted">{s.award_text}</span>}
              {s.is_primary && <span className="badge">Primary</span>}
              {s.raw_text && (
                <blockquote className="small muted" style={{ gridColumn: "1 / -1", margin: "4px 0 0 0" }}>
                  “{s.raw_text}”
                </blockquote>
              )}
              {canEdit && (
                <span className="score-actions">
                  <button className="link small" onClick={() => setEditingId(s.id)} disabled={pending}>Edit</button>
                  <button className="link small muted" onClick={() => onDelete(s.id)} disabled={pending}>Delete</button>
                </span>
              )}
            </li>
          ),
        )}
        {adding && (
          <li className="score-row editing">
            <ScoreForm vintageId={vintageId} onDone={() => setAdding(false)} criticOptions={criticOptions} />
          </li>
        )}
      </ul>
      {canEdit && !adding && (
        <button className="btn small" type="button" onClick={() => setAdding(true)}>
          + Add score
        </button>
      )}
    </div>
  );
}
