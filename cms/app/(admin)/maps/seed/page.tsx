import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { mapsSeedSnapshot } from "@/lib/actions";
import SeedMapsPanel from "@/components/SeedMapsPanel";
import ApproveAllDraftsButton from "@/components/ApproveAllDraftsButton";

export const dynamic = "force-dynamic";
// 5 locations × 1.1s/each + overhead = ~7s per batch, well under 60s.
export const maxDuration = 60;

// Phase 14 — the maps bulk-create hub.
//
// Walks every location that has no map polygon yet and queues them for an
// OpenStreetMap lookup. Each hit becomes a draft map_asset; a single
// "Approve all drafts" button then promotes the whole batch to approved.
export default async function MapsSeedPage() {
  const user = await requireEditor();
  const { stats, pending } = await mapsSeedSnapshot();

  return (
    <>
      <p className="crumbs">
        <Link href="/maps">Maps</Link> / Bulk seed
      </p>
      <header className="page-head">
        <h1>Bulk-create maps</h1>
        <p className="muted">
          Pulls each location's administrative boundary from OpenStreetMap and files it
          as a draft. One Approve-all button at the end promotes the whole batch to approved.
        </p>
      </header>

      <section className="panel">
        <h2>Current state</h2>
        <dl className="specs">
          <div>
            <dt>Locations total</dt>
            <dd>{stats?.total ?? 0}</dd>
          </div>
          <div>
            <dt>Already approved</dt>
            <dd>{stats?.approved ?? 0}</dd>
          </div>
          <div>
            <dt>In draft</dt>
            <dd>{stats?.draft ?? 0}</dd>
          </div>
          <div>
            <dt>No map at all</dt>
            <dd>
              {stats?.no_version ?? 0}
              {stats?.needs_map ? <span className="muted small"> · {stats.needs_map} tagged “needs map”</span> : null}
            </dd>
          </div>
          <div>
            <dt>Wines on an approved map</dt>
            <dd>{stats?.wine_count_with_map ?? 0}</dd>
          </div>
          <div>
            <dt>Wines on no / draft map</dt>
            <dd>{stats?.wine_count_no_map ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Seed from OpenStreetMap</h2>
        <p className="small muted">
          Each run processes up to <strong>5 locations</strong> at a time, with a one-second
          pause between lookups to honor OSM's rate limit. Rerun as many times as needed —
          the queue picks up where it left off and never re-seeds a location that already has
          a draft.
        </p>
        <SeedMapsPanel initialRemaining={stats?.no_version ?? 0} />
      </section>

      <section className="panel">
        <h2>Approve every draft</h2>
        <p className="small muted">
          Promotes the latest draft of every location to <strong>approved</strong> in one pass.
          Any currently approved map for the same location is retired (not deleted — you can
          roll back from the maps detail page). Admins only.
        </p>
        {user.role === "admin" ? (
          <ApproveAllDraftsButton pendingCount={stats?.draft ?? 0} />
        ) : (
          <p className="muted small">Only an admin can bulk-approve.</p>
        )}
      </section>

      <section className="panel">
        <h2>Next-up queue</h2>
        {pending.length === 0 ? (
          <p className="muted">Every location already has at least a draft map.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th className="right">Wines affected</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/maps/${p.id}`}>{p.name}</Link></td>
                  <td className="muted small">{p.type}</td>
                  <td className="right">{p.wine_count || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
