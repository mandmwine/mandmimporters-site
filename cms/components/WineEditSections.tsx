"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { autosaveWineVintageField, updateWineVintage, replaceGrapes } from "@/lib/actions";
import EditablePanel from "./EditablePanel";
import AutosaveTextarea from "./AutosaveTextarea";

export type EditableVintage = {
  id: string;
  vintage_text: string | null;
  status: string;
  mevushal: string;
  supervision_display: string | null;
  aging_display: string | null;
  bottle_sizes: string[];
  special_designation: string | null;
  tasting_note: string | null;
  food_pairing: string | null;
  short_description: string | null;
  first_kosher_vintage: boolean | null;
  organic: boolean | null;
  biodynamic: boolean | null;
  wine_story: string | null;
};

function Boolean3Select({ name, defaultValue }: { name: string; defaultValue: boolean | null }) {
  const v = defaultValue === null ? "" : defaultValue ? "yes" : "no";
  return (
    <select name={name} defaultValue={v}>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

export function EditableTechnical({
  v,
  summary,
  canEdit,
}: {
  v: EditableVintage;
  summary: React.ReactNode;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(close: () => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("id", v.id);
      start(async () => {
        await updateWineVintage(fd);
        router.refresh();
        close();
      });
    };
  }

  return (
    <EditablePanel title="Technical details" summary={summary} canEdit={canEdit}>
      {(close) => (
        <form className="form-grid two" onSubmit={submit(close)}>
          <label>
            Vintage
            <input name="vintage_text" defaultValue={v.vintage_text ?? ""} placeholder="2024 or NV" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={v.status}>
              <option value="draft">Draft</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </label>
          <label>
            Mevushal
            <select name="mevushal" defaultValue={v.mevushal}>
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Supervision
            <input name="supervision_display" defaultValue={v.supervision_display ?? ""} placeholder="OU; Badatz Beit Yosef" />
          </label>
          <label>
            Aging
            <input name="aging_display" defaultValue={v.aging_display ?? ""} placeholder="18 months in French oak" />
          </label>
          <label>
            Bottle sizes
            <input name="bottle_sizes" defaultValue={v.bottle_sizes.join(", ")} placeholder="750 ml, 1.5 L" />
          </label>
          <label className="span-2">
            Special designation
            <input name="special_designation" defaultValue={v.special_designation ?? ""} placeholder="DOCG, Grand Cru, Riserva…" />
          </label>
          <label>
            First kosher vintage
            <Boolean3Select name="first_kosher_vintage" defaultValue={v.first_kosher_vintage} />
          </label>
          <label>
            Organic
            <Boolean3Select name="organic" defaultValue={v.organic} />
          </label>
          <label>
            Biodynamic
            <Boolean3Select name="biodynamic" defaultValue={v.biodynamic} />
          </label>
          {/* Preserve existing copy on this submit — we save it in the Copy panel. */}
          <input type="hidden" name="tasting_note" value={v.tasting_note ?? ""} />
          <input type="hidden" name="food_pairing" value={v.food_pairing ?? ""} />
          <input type="hidden" name="short_description" value={v.short_description ?? ""} />
          <input type="hidden" name="wine_story" value={v.wine_story ?? ""} />
          <div className="span-2 form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button className="link" type="button" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </form>
      )}
    </EditablePanel>
  );
}

export function EditableCopy({
  v,
  summary,
  canEdit,
  aiButtons,
}: {
  v: EditableVintage;
  summary: React.ReactNode;
  canEdit: boolean;
  aiButtons?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(close: () => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("id", v.id);
      // Preserve non-copy fields.
      fd.set("vintage_text", v.vintage_text ?? "");
      fd.set("status", v.status);
      fd.set("mevushal", v.mevushal);
      fd.set("supervision_display", v.supervision_display ?? "");
      fd.set("aging_display", v.aging_display ?? "");
      fd.set("bottle_sizes", v.bottle_sizes.join(", "));
      fd.set("special_designation", v.special_designation ?? "");
      if (v.first_kosher_vintage !== null) fd.set("first_kosher_vintage", v.first_kosher_vintage ? "yes" : "no");
      if (v.organic !== null) fd.set("organic", v.organic ? "yes" : "no");
      if (v.biodynamic !== null) fd.set("biodynamic", v.biodynamic ? "yes" : "no");
      start(async () => {
        await updateWineVintage(fd);
        router.refresh();
        close();
      });
    };
  }

  function autosaveField(field: "tasting_note" | "food_pairing" | "wine_story") {
    return async (next: string) => {
      const fd = new FormData();
      fd.set("id", v.id);
      fd.set("field", field);
      fd.set("value", next);
      return autosaveWineVintageField(fd);
    };
  }

  return (
    <EditablePanel title="Copy" summary={summary} canEdit={canEdit} rightSlot={aiButtons}>
      {(close) => (
        <form className="form-grid" onSubmit={submit(close)}>
          <label>
            Tasting note
            <AutosaveTextarea
              name="tasting_note"
              rows={5}
              initialValue={v.tasting_note ?? ""}
              placeholder="2–5 lines at normal body size."
              save={autosaveField("tasting_note")}
              maxWarnAt={450}
            />
          </label>
          <label>
            Food pairing
            <AutosaveTextarea
              name="food_pairing"
              rows={3}
              initialValue={v.food_pairing ?? ""}
              save={autosaveField("food_pairing")}
            />
          </label>
          <label>
            Short description
            <input name="short_description" defaultValue={v.short_description ?? ""} placeholder="One-line summary for compact views" />
          </label>
          <label>
            Wine story (long form, not shown on standard sheet)
            <AutosaveTextarea
              name="wine_story"
              rows={4}
              initialValue={v.wine_story ?? ""}
              save={autosaveField("wine_story")}
            />
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save other fields"}
            </button>
            <button className="link" type="button" onClick={close} disabled={pending}>Close</button>
            <span className="small muted">Long-text fields save automatically.</span>
          </div>
        </form>
      )}
    </EditablePanel>
  );
}

export function EditableGrapes({
  vintageId,
  grapesText,
  summary,
  canEdit,
}: {
  vintageId: string;
  grapesText: string;
  summary: React.ReactNode;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(close: () => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("wine_vintage_id", vintageId);
      start(async () => {
        await replaceGrapes(fd);
        router.refresh();
        close();
      });
    };
  }

  return (
    <EditablePanel title="Grapes / Varietal" summary={summary} canEdit={canEdit}>
      {(close) => (
        <form className="form-grid" onSubmit={submit(close)}>
          <label>
            Blend
            <input
              name="grapes_text"
              defaultValue={grapesText}
              placeholder="60% Merlot, 40% Cabernet Franc"
              required
            />
            <span className="small muted">
              Comma separated. Prefix percentages with %. Unknown grapes are added to the master list.
            </span>
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save blend"}
            </button>
            <button className="link" type="button" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </form>
      )}
    </EditablePanel>
  );
}
