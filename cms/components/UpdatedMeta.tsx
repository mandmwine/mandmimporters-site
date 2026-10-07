// Server component: renders "Updated 3 min ago by alice@example.com".
// Used in record-detail headers to make trust/audit visible at a glance.
import { one } from "@/lib/db";

type Props = {
  entityType: string;    // "wine_vintage" | "producer" | "catalog" | "asset" | "map_asset"
  entityId: string;
  fallback?: Date | string | null;  // the row's own updated_at, if we have it
};

function relative(d: Date | string | null): string {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function UpdatedMeta({ entityType, entityId, fallback }: Props) {
  // Find the most recent audit event for this entity so we can name the person.
  const row = await one<{ created_at: Date; email: string | null }>(
    `SELECT a.created_at, u.email
       FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.created_at DESC LIMIT 1`,
    [entityType, entityId],
  );
  const when = row?.created_at ?? fallback ?? null;
  if (!when) return <span className="muted small">Updated —</span>;
  return (
    <span className="muted small record-updated" title={new Date(when).toLocaleString()}>
      Updated {relative(when)}
      {row?.email && ` by ${row.email}`}
    </span>
  );
}
