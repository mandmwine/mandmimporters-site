// QC scanner: walks the catalog and inserts/updates auto-generated review flags.
//
// Idempotent — before scanning, we close every open auto-generated flag; the
// scan reinserts any still-valid ones.  Flags created by humans ("legacy",
// manual "stale") are left alone (details.autogen is NULL).
import { one, query } from "@/lib/db";

type Counts = {
  missing_vintage: number;
  missing_mevushal: number;
  missing_supervision: number;
  missing_grapes: number;
  missing_scores: number;
  missing_tasting: number;
  missing_bottle: number;
  overflow: number;
  stale_sources: number;
  duplicate_wines: number;
};

const AUTOGEN = JSON.stringify({ autogen: true });

async function closeAutogen(): Promise<void> {
  await query(
    `UPDATE review_flags
       SET status = 'resolved', resolved_at = now(), details = details || '{"closed_by":"qc_scan"}'::jsonb
       WHERE status = 'open' AND details->>'autogen' = 'true'`,
  );
}

async function flag(
  entityType: string,
  entityId: string,
  fieldName: string | null,
  flagType: string,
  severity: "info" | "warning" | "error",
  message: string,
): Promise<void> {
  await query(
    `INSERT INTO review_flags
       (entity_type, entity_id, field_name, flag_type, severity, message, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [entityType, entityId, fieldName, flagType, severity, message, AUTOGEN],
  );
}

export async function runQcScan(): Promise<Counts> {
  await closeAutogen();

  const counts: Counts = {
    missing_vintage: 0,
    missing_mevushal: 0,
    missing_supervision: 0,
    missing_grapes: 0,
    missing_scores: 0,
    missing_tasting: 0,
    missing_bottle: 0,
    overflow: 0,
    stale_sources: 0,
    duplicate_wines: 0,
  };

  // Vintages — every row that has a problem gets at most one flag per field.
  type V = {
    id: string;
    vintage_text: string | null;
    mevushal: string;
    supervision_display: string | null;
    tasting_note: string | null;
    bottle_asset_id: string | null;
    has_grapes: boolean;
    has_scores: boolean;
    status: string;
  };
  const vintages = await query<V>(
    `SELECT v.id, v.vintage_text, v.mevushal, v.supervision_display, v.tasting_note,
            v.bottle_asset_id, v.status,
       (EXISTS (SELECT 1 FROM wine_grapes g WHERE g.wine_vintage_id = v.id)) AS has_grapes,
       (EXISTS (SELECT 1 FROM wine_scores s WHERE s.wine_vintage_id = v.id)) AS has_scores
     FROM wine_vintages v
     WHERE v.deleted_at IS NULL`,
  );

  for (const v of vintages) {
    // Skip discontinued — no point flagging a wine that's gone.
    if (v.status === "discontinued") continue;

    if (!v.vintage_text) {
      await flag("wine_vintage", v.id, "vintage_text", "missing", "warning",
        "No vintage is recorded for this wine.");
      counts.missing_vintage++;
    }
    if (v.mevushal === "unknown") {
      await flag("wine_vintage", v.id, "mevushal", "missing", "warning",
        "Mevushal status is not recorded.");
      counts.missing_mevushal++;
    }
    if (!v.supervision_display) {
      await flag("wine_vintage", v.id, "supervision_display", "missing", "warning",
        "Supervision authority not recorded.");
      counts.missing_supervision++;
    }
    if (!v.has_grapes) {
      await flag("wine_vintage", v.id, "grapes", "missing", "warning",
        "Grape blend not recorded.");
      counts.missing_grapes++;
    }
    if (!v.has_scores) {
      await flag("wine_vintage", v.id, "scores", "missing", "info",
        "No critic scores recorded.");
      counts.missing_scores++;
    }
    if (!v.tasting_note) {
      await flag("wine_vintage", v.id, "tasting_note", "missing", "warning",
        "No tasting note has been written.");
      counts.missing_tasting++;
    } else if (v.tasting_note.length > 450) {
      await flag("wine_vintage", v.id, "tasting_note", "overflow", "warning",
        `Tasting note is ${v.tasting_note.length} characters (target 250–450). May overflow on the printed sheet.`);
      counts.overflow++;
    }
    if (!v.bottle_asset_id) {
      await flag("wine_vintage", v.id, "bottle_asset_id", "image", "info",
        "No bottle image uploaded.");
      counts.missing_bottle++;
    }
  }

  // Stale provenance — any verified row older than 180 days flags on the
  // entity, grouped by entity so we don't drown anyone in rows.
  const stale = await query<{ entity_type: string; entity_id: string; n: number }>(
    `SELECT fp.entity_type, fp.entity_id, count(*)::int AS n
       FROM field_provenance fp
       WHERE fp.verification_status = 'verified'
         AND fp.is_current
         AND fp.verified_at < now() - interval '180 days'
       GROUP BY fp.entity_type, fp.entity_id`,
  );
  for (const s of stale) {
    await flag(s.entity_type, s.entity_id, null, "stale", "info",
      `${s.n} source${s.n === 1 ? "" : "s"} verified more than 180 days ago.`);
    counts.stale_sources += s.n;
  }

  // Duplicate wines — same canonical_name within a producer.
  const dups = await query<{ producer_id: string; canonical_name: string; ids: string[] }>(
    `SELECT producer_id, canonical_name, array_agg(id) AS ids
       FROM wines WHERE deleted_at IS NULL
       GROUP BY producer_id, lower(canonical_name)
       HAVING count(*) > 1`,
  );
  for (const d of dups) {
    for (const wineId of d.ids) {
      await flag("wine", wineId, "canonical_name", "duplicate", "warning",
        `Two or more wines share the canonical name "${d.canonical_name}" under this producer.`);
    }
    counts.duplicate_wines += d.ids.length;
  }

  return counts;
}

export async function qcLastRun(): Promise<Date | null> {
  const row = await one<{ at: Date }>(
    `SELECT max(resolved_at) AS at FROM review_flags
       WHERE details->>'closed_by' = 'qc_scan'`,
  );
  return row?.at ?? null;
}
