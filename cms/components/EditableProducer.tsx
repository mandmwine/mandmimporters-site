"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProducer } from "@/lib/actions";
import EditablePanel from "./EditablePanel";

export type ProducerFields = {
  id: string;
  name: string;
  short_name: string | null;
  website: string | null;
  winery_summary_short: string | null;
  winery_story_long: string | null;
  default_supervision_display: string | null;
  country_location_id: string | null;
  primary_location_id: string | null;
  active: boolean;
};

export type LocationChoice = { id: string; name: string; path: string };

export function EditableProducer({
  producer,
  summary,
  canEdit,
  countries,
  regions,
}: {
  producer: ProducerFields;
  summary: React.ReactNode;
  canEdit: boolean;
  countries: LocationChoice[];
  regions: LocationChoice[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(close: () => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("id", producer.id);
      start(async () => {
        await updateProducer(fd);
        router.refresh();
        close();
      });
    };
  }

  return (
    <EditablePanel title="Producer details" summary={summary} canEdit={canEdit}>
      {(close) => (
        <form className="form-grid two" onSubmit={submit(close)}>
          <label>
            Name
            <input name="name" defaultValue={producer.name} required />
          </label>
          <label>
            Short name
            <input name="short_name" defaultValue={producer.short_name ?? ""} placeholder="For compact listings" />
          </label>
          <label className="span-2">
            Website
            <input name="website" type="url" defaultValue={producer.website ?? ""} placeholder="https://…" />
          </label>
          <label>
            Country
            <select name="country_location_id" defaultValue={producer.country_location_id ?? ""}>
              <option value="">—</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Primary region
            <select name="primary_location_id" defaultValue={producer.primary_location_id ?? ""}>
              <option value="">—</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.path}</option>)}
            </select>
          </label>
          <label className="span-2">
            Default supervision
            <input
              name="default_supervision_display"
              defaultValue={producer.default_supervision_display ?? ""}
              placeholder="OU; Badatz Beit Yosef — inherited by this producer's wines unless overridden"
            />
          </label>
          <label className="span-2">
            Winery summary (short) — 2–3 sentences, used on producer lineup pages
            <textarea
              name="winery_summary_short"
              rows={3}
              defaultValue={producer.winery_summary_short ?? ""}
            />
          </label>
          <label className="span-2">
            Winery story (long) — appears on the producer's own catalog page
            <textarea
              name="winery_story_long"
              rows={6}
              defaultValue={producer.winery_story_long ?? ""}
            />
          </label>
          <label>
            Status
            <select name="active" defaultValue={producer.active ? "true" : "false"}>
              <option value="true">Active</option>
              <option value="false">Inactive (hidden from new catalogs)</option>
            </select>
          </label>
          <div className="span-2 form-actions">
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save producer"}
            </button>
            <button className="link" type="button" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </form>
      )}
    </EditablePanel>
  );
}
