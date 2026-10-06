"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssetMeta } from "@/lib/actions";

export type AssetMeta = {
  id: string;
  kind: string;
  file_name: string | null;
  alt_text: string;
  caption: string;
  credit_line: string;
  tags: string[];
};

const KINDS = ["bottle", "map", "logo", "photo", "document", "pdf", "other"] as const;

export default function AssetEditForm({ asset, canEdit }: { asset: AssetMeta; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", asset.id);
    start(async () => {
      await updateAssetMeta(fd);
      router.refresh();
    });
  }

  if (!canEdit) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Metadata</h2></div>
        <dl className="kv">
          <dt>Kind</dt><dd>{asset.kind}</dd>
          <dt>File name</dt><dd>{asset.file_name ?? "—"}</dd>
          <dt>Alt text</dt><dd>{asset.alt_text || <span className="muted">—</span>}</dd>
          <dt>Caption</dt><dd>{asset.caption || <span className="muted">—</span>}</dd>
          <dt>Credit</dt><dd>{asset.credit_line || <span className="muted">—</span>}</dd>
          <dt>Tags</dt><dd>{asset.tags.length ? asset.tags.join(", ") : <span className="muted">—</span>}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head"><h2>Metadata</h2></div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Kind
          <select name="kind" defaultValue={asset.kind}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          File name
          <input name="file_name" defaultValue={asset.file_name ?? ""} />
        </label>
        <label>
          Alt text
          <input
            name="alt_text"
            defaultValue={asset.alt_text}
            placeholder="Short description for screen readers (e.g. &ldquo;Alban Vintners Grenache 2022 bottle&rdquo;)"
          />
        </label>
        <label>
          Caption
          <input name="caption" defaultValue={asset.caption} placeholder="Optional caption printed under the image" />
        </label>
        <label>
          Credit line
          <input name="credit_line" defaultValue={asset.credit_line} placeholder="Photographer or source credit" />
        </label>
        <label>
          Tags
          <input
            name="tags"
            defaultValue={asset.tags.join(", ")}
            placeholder="Comma separated. e.g. hero, lifestyle, trade"
          />
        </label>
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save metadata"}
          </button>
        </div>
      </form>
    </div>
  );
}
