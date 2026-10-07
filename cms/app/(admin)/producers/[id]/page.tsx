import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { EditableProducer, type LocationChoice, type ProducerFields } from "@/components/EditableProducer";
import SourcesPanel, { type ProvenanceRow } from "@/components/SourcesPanel";
import CopyButton from "@/components/CopyButton";
import UpdatedMeta from "@/components/UpdatedMeta";

export const dynamic = "force-dynamic";

type Row = ProducerFields & {
  slug: string;
  country_name: string | null;
  region_name: string | null;
};

type Wine = {
  wine_id: string;
  vintage_id: string | null;
  display_name: string;
  vintage_text: string | null;
  status: string | null;
  category: string | null;
};

export default async function ProducerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getSessionUser();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const h = await headers();
  const shareUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "mandmimporters.com"}/catalog-admin/producers/${id}`;

  const [producerMaybe, wines, provenance, countries, regions, openFlags] = await Promise.all([
    one<Row>(
      `SELECT p.id, p.name, p.short_name, p.slug, p.website,
              p.winery_summary_short, p.winery_story_long, p.default_supervision_display,
              p.country_location_id, p.primary_location_id, p.active,
              c.name AS country_name, r.name AS region_name
         FROM producers p
         LEFT JOIN locations c ON c.id = p.country_location_id
         LEFT JOIN locations r ON r.id = p.primary_location_id
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id],
    ),
    query<Wine>(
      `SELECT w.id AS wine_id, w.display_name, w.category,
          (SELECT v.id FROM wine_vintages v WHERE v.wine_id = w.id AND v.deleted_at IS NULL
             ORDER BY v.vintage_text DESC NULLS LAST LIMIT 1) AS vintage_id,
          (SELECT v.vintage_text FROM wine_vintages v WHERE v.wine_id = w.id AND v.deleted_at IS NULL
             ORDER BY v.vintage_text DESC NULLS LAST LIMIT 1) AS vintage_text,
          (SELECT v.status FROM wine_vintages v WHERE v.wine_id = w.id AND v.deleted_at IS NULL
             ORDER BY v.vintage_text DESC NULLS LAST LIMIT 1) AS status
       FROM wines w WHERE w.producer_id = $1 AND w.deleted_at IS NULL
       ORDER BY w.display_name`,
      [id],
    ),
    query<ProvenanceRow & { entity_id: string }>(
      `SELECT fp.id, fp.field_name, fp.raw_value, fp.verification_status, fp.verified_at,
              fp.is_current, fp.entity_id, fp.source_locator,
              u.email AS verified_by_email,
              s.title AS source_title, s.url AS source_url, s.source_type AS source_type,
              (SELECT count(*)::int FROM field_provenance x
                 WHERE x.entity_type = fp.entity_type AND x.entity_id = fp.entity_id
                   AND x.field_name = fp.field_name AND x.id <> fp.id AND x.is_current) AS conflict_count
         FROM field_provenance fp
         LEFT JOIN sources s ON s.id = fp.source_id
         LEFT JOIN users u ON u.id = fp.verified_by
         WHERE fp.entity_type = 'producer' AND fp.entity_id = $1
         ORDER BY fp.field_name, fp.is_current DESC, fp.verification_status, fp.created_at DESC`,
      [id],
    ),
    query<LocationChoice>(
      "SELECT id, name, name AS path FROM locations WHERE type = 'country' ORDER BY name",
    ),
    query<LocationChoice>(
      // Region = any non-country location, labelled with its country.
      `SELECT l.id, l.name,
              coalesce(c.name || ' / ' || l.name, l.name) AS path
         FROM locations l LEFT JOIN locations c ON c.id = l.parent_id
         WHERE l.type IN ('region', 'subregion')
         ORDER BY coalesce(c.name, l.name), l.name`,
    ),
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM review_flags f
         JOIN wine_vintages v ON v.id = f.entity_id AND f.entity_type = 'wine_vintage'
         JOIN wines w ON w.id = v.wine_id
         WHERE w.producer_id = $1 AND f.status = 'open'`,
      [id],
    ),
  ]);
  if (!producerMaybe) notFound();
  const producer: Row = producerMaybe;

  const summary = (
    <dl className="specs">
      {([
        ["Name", producer.name],
        ["Short name", producer.short_name],
        ["Website", producer.website ? (<a href={producer.website} target="_blank" rel="noreferrer">{producer.website}</a>) : null],
        ["Country", producer.country_name],
        ["Primary region", producer.region_name],
        ["Default supervision", producer.default_supervision_display],
        ["Status", producer.active ? "Active" : "Inactive"],
      ] as [string, React.ReactNode][]).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ? v : <span className="missing">not recorded</span>}</dd>
        </div>
      ))}
      {producer.winery_summary_short && (
        <div className="span-2">
          <dt>Summary</dt>
          <dd>{producer.winery_summary_short}</dd>
        </div>
      )}
      {producer.winery_story_long && (
        <div className="span-2">
          <dt>Full story</dt>
          <dd className="small" style={{ whiteSpace: "pre-wrap" }}>{producer.winery_story_long}</dd>
        </div>
      )}
    </dl>
  );

  const fieldSuggestions = [
    "name", "short_name", "website", "winery_summary_short", "winery_story_long",
    "default_supervision_display", "country_location_id", "primary_location_id",
  ];

  return (
    <>
      <nav className="crumbs">
        <Link href="/producers">← All producers</Link>
      </nav>
      <header className="page-head row">
        <div>
          <h1>{producer.name}</h1>
          <p className="muted">
            {[producer.region_name, producer.country_name].filter(Boolean).join(" · ")}
            {" · "}
            {wines.length} wine{wines.length === 1 ? "" : "s"}
            {openFlags[0].n > 0 && (
              <>
                {" · "}
                <Link href={`/review?producer=${id}`}>{openFlags[0].n} open flag{openFlags[0].n === 1 ? "" : "s"}</Link>
              </>
            )}
          </p>
          <p className="small muted record-meta">
            <UpdatedMeta entityType="producer" entityId={id} />
            {" · "}
            <CopyButton value={shareUrl} label="Copy link" compact />
            <CopyButton value={id} label="ID" compact />
          </p>
        </div>
      </header>

      <div className="split wide">
        <div>
          <EditableProducer
            producer={{
              id: producer.id,
              name: producer.name,
              short_name: producer.short_name,
              website: producer.website,
              winery_summary_short: producer.winery_summary_short,
              winery_story_long: producer.winery_story_long,
              default_supervision_display: producer.default_supervision_display,
              country_location_id: producer.country_location_id,
              primary_location_id: producer.primary_location_id,
              active: producer.active,
            }}
            summary={summary}
            canEdit={canEdit}
            countries={countries}
            regions={regions}
          />

          <SourcesPanel
            entityType="producer"
            entityId={producer.id}
            rows={provenance}
            canEdit={canEdit}
            fieldSuggestions={fieldSuggestions}
          />
        </div>

        <div>
          <div className="panel">
            <h2>Wines</h2>
            {wines.length === 0 ? (
              <p className="muted">No wines yet.</p>
            ) : (
              <ul className="plain-list">
                {wines.map((w) => (
                  <li key={w.wine_id}>
                    {w.vintage_id ? (
                      <Link href={`/wines/${w.vintage_id}`} className="strong">
                        {w.display_name}{w.vintage_text ? ` ${w.vintage_text}` : ""}
                      </Link>
                    ) : (
                      <span className="strong">{w.display_name}</span>
                    )}
                    {w.status && <> <span className="muted small">· {w.status.replace(/_/g, " ")}</span></>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
