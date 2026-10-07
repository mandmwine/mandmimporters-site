"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteThemeTokens, upsertThemeTokens } from "@/lib/actions";

type Row = {
  id: string;
  scope_type: "global" | "category" | "region";
  scope_key: string;
  tokens: Record<string, string>;
  updated_at: Date | string;
  updated_by_email: string | null;
};

const SCOPE_HELP: Record<Row["scope_type"], string> = {
  global: "Scope key is just a name, e.g. &ldquo;default&rdquo;.",
  category: "Scope key is a wine category: red / white / rose / sparkling / dessert / fortified / orange / other.",
  region: "Scope key is a region or country name, matched case-insensitively against locations.",
};

export default function ThemeTokensEditor({
  row,
  canEdit,
}: {
  row: Row | null;
  canEdit: boolean;
}) {
  const isNew = row === null;
  const [scopeType, setScopeType] = useState<Row["scope_type"]>(row?.scope_type ?? "global");
  const [scopeKey, setScopeKey] = useState(row?.scope_key ?? "");
  const [tokensRaw, setTokensRaw] = useState(JSON.stringify(row?.tokens ?? {}, null, 2));
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(isNew ? false : false);
  const router = useRouter();

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNote(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await upsertThemeTokens(fd);
      if (!r.ok) {
        setNote({ ok: false, text: r.message ?? "Save failed." });
        return;
      }
      setNote({ ok: true, text: isNew ? "Created." : "Saved." });
      if (isNew) {
        setScopeKey("");
        setTokensRaw("{}");
      }
      router.refresh();
    });
  }

  function remove() {
    if (!row) return;
    const fd = new FormData();
    fd.set("id", row.id);
    start(async () => {
      await deleteThemeTokens(fd);
      router.refresh();
    });
  }

  return (
    <div className="panel theme-row">
      <div className="panel-head">
        <h2>
          {isNew ? "+ New theme scope" : `${row.scope_type} / ${row.scope_key}`}
        </h2>
        {!isNew && (
          <button type="button" className="link small" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Edit"}
          </button>
        )}
      </div>

      {!isNew && !open && (
        <>
          <TokenPreview tokens={row.tokens} />
          <p className="small muted">
            Updated {new Date(row.updated_at).toLocaleDateString("en-US")}
            {row.updated_by_email && ` by ${row.updated_by_email}`}
          </p>
        </>
      )}

      {(isNew || open) && (
        <form className="form-grid two" onSubmit={save}>
          <label>
            Scope type
            <select
              name="scope_type"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as Row["scope_type"])}
              disabled={!canEdit || !isNew}
            >
              <option value="global">global</option>
              <option value="category">category</option>
              <option value="region">region</option>
            </select>
          </label>
          <label>
            Scope key
            <input
              name="scope_key"
              value={scopeKey}
              onChange={(e) => setScopeKey(e.target.value)}
              required
              disabled={!canEdit || !isNew}
            />
          </label>
          <p className="span-2 small muted" dangerouslySetInnerHTML={{ __html: SCOPE_HELP[scopeType] }} />
          <label className="span-2">
            Tokens — a JSON object of key:value strings
            <textarea
              name="tokens"
              rows={10}
              value={tokensRaw}
              onChange={(e) => setTokensRaw(e.target.value)}
              className="mono small"
              disabled={!canEdit}
            />
            <span className="small muted">
              Common keys: <code>color.accent</code>, <code>color.rule</code>,{" "}
              <code>color.paper</code>, <code>font.body</code>, <code>font.display</code>.{" "}
              Hex colors or CSS values.
            </span>
          </label>
          <div className="span-2 form-actions">
            <button className="btn primary" type="submit" disabled={pending || !canEdit}>
              {pending ? "Saving…" : isNew ? "Create" : "Save tokens"}
            </button>
            {!isNew && canEdit && (
              <button type="button" className="btn danger small" onClick={remove} disabled={pending}>
                Delete scope
              </button>
            )}
            {note && (
              <span className={`small ${note.ok ? "ok" : "error"}`}>{note.text}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function TokenPreview({ tokens }: { tokens: Record<string, string> }) {
  const entries = Object.entries(tokens).slice(0, 6);
  if (entries.length === 0) return <p className="muted small">No tokens defined.</p>;
  return (
    <dl className="specs small">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            {v.startsWith("#") && (
              <span
                className="color-swatch"
                style={{ background: v }}
                aria-hidden
              />
            )}
            <code>{v}</code>
          </dd>
        </div>
      ))}
      {Object.keys(tokens).length > entries.length && (
        <div>
          <dt />
          <dd className="muted">+ {Object.keys(tokens).length - entries.length} more</dd>
        </div>
      )}
    </dl>
  );
}
