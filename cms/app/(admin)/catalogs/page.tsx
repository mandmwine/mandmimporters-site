import Link from "next/link";
import { query } from "@/lib/db";
import NewCatalogForm from "./NewCatalogForm";
import ClickableRow from "@/components/ClickableRow";
import SortableTh from "@/components/SortableTh";

export const dynamic = "force-dynamic";

const SORT: Record<string, string> = {
  name: "c.name",
  wines: "wine_count",
  layout: "c.render_mode",
  updated: "c.updated_at",
  export: "last_export_at",
};

type CatalogRow = {
  id: string;
  name: string;
  season: string | null;
  render_mode: string;
  status: string;
  wine_count: number;
  updated_at: Date;
  last_export_at: Date | null;
};

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sort = sp.sort && SORT[sp.sort] ? sp.sort : "";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const orderClause = sort
    ? `${SORT[sort]} ${dir === "desc" ? "DESC" : "ASC"} NULLS LAST, c.name`
    : "c.updated_at DESC";

  const rows = await query<CatalogRow>(
    `SELECT c.id, c.name, c.season, c.render_mode, c.status, c.updated_at,
       (SELECT count(*)::int FROM catalog_items ci WHERE ci.catalog_id = c.id) AS wine_count,
       (SELECT max(ef.created_at) FROM export_files ef
          JOIN catalog_versions cv ON cv.id = ef.catalog_version_id
          WHERE cv.catalog_id = c.id) AS last_export_at
     FROM catalogs c
     WHERE c.status = 'working'
     ORDER BY ${orderClause}`,
  );
  return (
    <>
      <header className="page-head">
        <h1>Catalogs</h1>
        <p className="muted">A catalog is a composition of wines + sections. Export produces a PDF.</p>
      </header>

      <section className="split wide">
        <div>
          {rows.length === 0 ? (
            <div className="panel">
              <p className="muted">No catalogs yet. Create your first on the right.</p>
            </div>
          ) : (
            <table className="table table-rows">
              <thead>
                <tr>
                  <SortableTh label="Name" field="name" />
                  <SortableTh label="Wines" field="wines" />
                  <SortableTh label="Layout" field="layout" />
                  <SortableTh label="Updated" field="updated" />
                  <SortableTh label="Last export" field="export" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <ClickableRow key={c.id} href={`/catalogs/${c.id}`}>
                    <td>
                      <Link href={`/catalogs/${c.id}`} className="strong">{c.name}</Link>
                      {c.season && <div className="muted small">{c.season}</div>}
                    </td>
                    <td>{c.wine_count}</td>
                    <td className="small">{c.render_mode}</td>
                    <td className="small muted">{new Date(c.updated_at).toLocaleDateString("en-US")}</td>
                    <td className="small muted">
                      {c.last_export_at ? new Date(c.last_export_at).toLocaleDateString("en-US") : "—"}
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <NewCatalogForm />
      </section>
    </>
  );
}
