import Link from "next/link";
import { query } from "@/lib/db";
import NewCatalogForm from "./NewCatalogForm";
import ClickableRow from "@/components/ClickableRow";

export const dynamic = "force-dynamic";

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

export default async function CatalogsPage() {
  const rows = await query<CatalogRow>(
    `SELECT c.id, c.name, c.season, c.render_mode, c.status, c.updated_at,
       (SELECT count(*)::int FROM catalog_items ci WHERE ci.catalog_id = c.id) AS wine_count,
       (SELECT max(ef.created_at) FROM export_files ef
          JOIN catalog_versions cv ON cv.id = ef.catalog_version_id
          WHERE cv.catalog_id = c.id) AS last_export_at
     FROM catalogs c
     WHERE c.status = 'working'
     ORDER BY c.updated_at DESC`,
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
                  <th>Name</th>
                  <th>Wines</th>
                  <th>Layout</th>
                  <th>Updated</th>
                  <th>Last export</th>
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
