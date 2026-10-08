"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEscClose } from "./useEscClose";
import {
  attachSource,
  pushProvenanceValue,
  rejectProvenance,
  resolveProvenanceConflict,
  resolveWithManualValue,
  verifyProvenance,
} from "@/lib/actions";

// Phase 38 — vocabulary expanded to include 'accepted' (winner of a
// resolved conflict) and 'superseded' (reserved for later). The server-side
// CHECK constraint was updated in migration 0008.
export type ProvenanceRow = {
  id: string;
  field_name: string;
  raw_value: string | null;
  verification_status: "unverified" | "verified" | "conflict" | "accepted" | "rejected" | "superseded";
  verified_at: Date | string | null;
  verified_by_email: string | null;
  is_current: boolean;
  source_title: string | null;
  source_url: string | null;
  source_type: string | null;
  source_locator: string | null;
  conflict_count: number;   // other current rows for the same (entity, field)
};

const SOURCE_TYPES: [string, string][] = [
  ["tech_sheet", "Tech sheet"],
  ["producer_website", "Producer website"],
  ["appellation_authority", "Appellation authority"],
  ["critic_review", "Critic review"],
  ["mm_catalog", "M&M catalog"],
  ["mm_website", "M&M website"],
  ["import_document", "Import document"],
  ["winery_correspondence", "Winery correspondence"],
  ["other", "Other"],
];

export default function SourcesPanel({
  entityType,
  entityId,
  rows,
  canEdit,
  fieldSuggestions,
}: {
  entityType: "wine_vintage" | "producer";
  entityId: string;
  rows: ProvenanceRow[];
  canEdit: boolean;
  fieldSuggestions: string[];
}) {
  const [showAttach, setShowAttach] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  useEscClose(showAttach, () => setShowAttach(false));

  function act(fn: (fd: FormData) => Promise<unknown>, id: string) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await fn(fd);
      router.refresh();
    });
  }

  // Group rows by field so conflicts are visible.
  const byField = new Map<string, ProvenanceRow[]>();
  for (const r of rows) {
    const list = byField.get(r.field_name) ?? [];
    list.push(r);
    byField.set(r.field_name, list);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Sources</h2>
        {canEdit && (
          <button type="button" className="btn small" onClick={() => setShowAttach((v) => !v)}>
            {showAttach ? "Cancel" : "+ Attach source"}
          </button>
        )}
      </div>

      {showAttach && (
        <AttachSourceForm
          entityType={entityType}
          entityId={entityId}
          fieldSuggestions={fieldSuggestions}
          onDone={() => {
            setShowAttach(false);
            router.refresh();
          }}
        />
      )}

      {rows.length === 0 ? (
        <p className="muted">No source recorded yet.</p>
      ) : (
        <div className="prov-list">
          {[...byField.entries()].map(([field, group]) => {
            // Phase 38 — count only the still-current rows as "competing";
            // once a conflict is resolved, the group may keep rejected rows
            // around for audit, but the field is no longer disputed.
            const liveGroup = group.filter((p) => p.is_current && p.verification_status !== "rejected");
            const inConflict = liveGroup.length > 1;
            return (
            <div key={field} className={`prov-field${inConflict ? " prov-field--conflict" : ""}`}>
              <div className="prov-field__label">
                {field.replace(/_/g, " ")}
                {inConflict && <span className="badge badge--warn-badge">{liveGroup.length} competing</span>}
              </div>
              {inConflict && canEdit && (
                <ManualResolveForm
                  entityType={entityType}
                  entityId={entityId}
                  fieldName={field}
                />
              )}
              <ul className="prov-rows">
                {group.map((p) => (
                  <li key={p.id} className={`prov-row prov-row--${p.verification_status} ${p.is_current ? "" : "prov-row--stale"}`}>
                    <div className="prov-row__value">
                      {p.raw_value ? <span className="prov-row__text">{p.raw_value}</span> : <span className="muted">— no raw value —</span>}
                    </div>
                    <div className="prov-row__meta small muted">
                      <span>
                        {p.source_title ?? "No source title"}
                        {p.source_type ? ` · ${p.source_type.replace(/_/g, " ")}` : ""}
                        {p.source_locator ? ` · ${p.source_locator}` : ""}
                      </span>
                      {p.source_url && (
                        <>
                          {" · "}
                          <a href={p.source_url} target="_blank" rel="noreferrer">open ↗</a>
                        </>
                      )}
                      {" · "}
                      <StatusChip status={p.verification_status} />
                      {p.verified_at && (
                        <> · {p.verification_status === "verified" ? "verified" : "updated"}{" "}
                        {new Date(p.verified_at).toLocaleDateString("en-US")}
                        {p.verified_by_email && ` by ${p.verified_by_email}`}</>
                      )}
                      {!p.is_current && " · superseded"}
                    </div>
                    {canEdit && (
                      <div className="prov-row__actions">
                        {p.verification_status !== "verified" && p.is_current && (
                          <button
                            type="button"
                            className="btn small"
                            disabled={pending}
                            onClick={() => act(verifyProvenance, p.id)}
                          >
                            Verify
                          </button>
                        )}
                        {p.verification_status !== "rejected" && (
                          <button
                            type="button"
                            className="btn danger small"
                            disabled={pending}
                            onClick={() => act(rejectProvenance, p.id)}
                          >
                            Reject
                          </button>
                        )}
                        {inConflict && p.is_current && p.verification_status !== "rejected" && (
                          <button
                            type="button"
                            className="btn primary small"
                            disabled={pending}
                            onClick={() => act(resolveProvenanceConflict, p.id)}
                            title="Pick this value as the winner and reject the others"
                          >
                            Pick this
                          </button>
                        )}
                        {p.raw_value && !inConflict && (
                          <PushValueButton id={p.id} />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: ProvenanceRow["verification_status"] }) {
  // Phase 38 — accepted + superseded join the lexicon. 'accepted' labels
  // the explicit winner of a conflict resolution; 'superseded' labels an
  // older row that a later vintage change replaced.
  const label =
    status === "accepted" ? "accepted" :
    status === "verified" ? "verified" :
    status === "rejected" ? "rejected" :
    status === "conflict" ? "conflict" :
    status === "superseded" ? "superseded" : "unverified";
  return <span className={`prov-chip prov-chip--${status}`}>{label}</span>;
}

// Phase 38 — Resolve-with-manual-value form shown inline whenever a field
// has more than one competing source. Keeps the entry low-friction: just a
// text input, optional note, Submit. The server action marks every current
// row rejected, creates a new row carrying this manual value with
// verification_status='accepted', and pushes to the entity column.
function ManualResolveForm({
  entityType,
  entityId,
  fieldName,
}: {
  entityType: "wine_vintage" | "producer";
  entityId: string;
  fieldName: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("entity_type", entityType);
    fd.set("entity_id", entityId);
    fd.set("field_name", fieldName);
    fd.set("value", value.trim());
    if (note.trim()) fd.set("note", note.trim());
    start(async () => {
      const res = await resolveWithManualValue(fd);
      if (!res.ok) {
        setError(res.message ?? "Could not save.");
        return;
      }
      setValue("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <p className="prov-field__manual-link small">
        None of the above right?{" "}
        <button type="button" className="link small" onClick={() => setOpen(true)}>
          Enter a different value
        </button>
      </p>
    );
  }

  return (
    <form className="prov-field__manual" onSubmit={submit}>
      <label className="small">
        Correct value for {fieldName.replace(/_/g, " ")}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type the value you want to be authoritative"
          autoFocus
          required
        />
      </label>
      <label className="small">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Where this came from"
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn primary small" disabled={pending || !value.trim()}>
          {pending ? "Saving…" : "Save and reject the others"}
        </button>
        <button type="button" className="link small" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}

function PushValueButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  function push() {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      const res = await pushProvenanceValue(fd);
      if (!res.ok) {
        setNote(res.message ?? "Could not replace value.");
        return;
      }
      router.refresh();
    });
  }
  return (
    <>
      <button
        type="button"
        className="btn small"
        disabled={pending}
        onClick={push}
        title="Overwrite the current field with this source's raw value"
      >
        {pending ? "…" : "Replace value"}
      </button>
      {note && <span className="small warn-text">{note}</span>}
    </>
  );
}

function AttachSourceForm({
  entityType,
  entityId,
  fieldSuggestions,
  onDone,
}: {
  entityType: "wine_vintage" | "producer";
  entityId: string;
  fieldSuggestions: string[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), select, textarea",
    )?.focus();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("entity_type", entityType);
    fd.set("entity_id", entityId);
    start(async () => {
      const res = await attachSource(fd);
      if (!res.ok) {
        setError(res.message ?? "Save failed.");
        return;
      }
      onDone();
    });
  }

  return (
    <form ref={formRef} className="attach-source form-grid two" onSubmit={onSubmit}>
      <label>
        Field
        <input
          name="field_name"
          list="prov-fields"
          placeholder="e.g. aging_display, mevushal, supervision_display"
          required
        />
        <datalist id="prov-fields">
          {fieldSuggestions.map((f) => <option key={f} value={f} />)}
        </datalist>
      </label>
      <label>
        Source type
        <select name="source_type" defaultValue="tech_sheet" required>
          {SOURCE_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="span-2">
        Source title
        <input name="title" placeholder='e.g. "2022 Chianti Classico tech sheet"' required />
      </label>
      <label className="span-2">
        Source URL (optional)
        <input name="url" type="url" placeholder="https://…" />
      </label>
      <label className="span-2">
        Raw value this source gives for the field (optional)
        <textarea name="raw_value" rows={2} placeholder="Copy the exact phrasing from the source" />
      </label>
      <label className="span-2">
        Notes (optional)
        <input name="notes" placeholder="Where in the document, context, etc." />
      </label>
      <div className="span-2 form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Attach source"}
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
