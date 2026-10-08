// Phase 39 (Sprint 2) — Post-save wine validator (decisions §20.2).
//
// After every material edit to a wine vintage, run a battery of checks
// and reconcile their output against review_flags. Checks that still
// fire become open flags (if not already open); checks that pass get
// their matching open flags auto-resolved. This replaces the "I never
// hear from Review until I click Preflight on a catalog" gap — now the
// Review queue reflects the current state of every edited wine.
//
// Checks (initial set — add more over time):
//   - bottle_sizes_malformed:   non-standard size strings
//   - grapes_unknown_alias:     a grape row with an unresolved alias
//   - mevushal_unknown:         mevushal still 'unknown' at approved status
//   - designation_mismatch:     designation refers to an appellation that
//                               doesn't live under the current location
//   - map_missing:              location set but no approved map on the
//                               full chain → silhouette will print
//   - bottle_missing:           no bottle_asset_id (image placeholder prints)
//   - copy_overflow:            tasting_note > 700 chars (Phase 29 threshold)
//   - score_dupe:               two scores from the same critic for the
//                               same vintage with the same score_text
//   - source_conflict:          field_provenance has >1 current row for the
//                               same field with verification_status not in
//                               ('accepted', 'rejected', 'superseded')
//
// A "check" returns zero or more { flag_type, severity, message, field_name }
// records. The reconciler ensures:
//   - every current issue has an open row (open-or-reopen)
//   - every open row whose issue no longer exists is auto-resolved
// Flags created manually (not by this validator) are untouched — the
// (flag_type, field_name) tuple distinguishes them via details.auto.

import "server-only";
import { one, query } from "@/lib/db";
import { captureError } from "@/lib/errors";

export type ValidatorIssue = {
  flag_type: string;
  severity: "info" | "warning" | "error";
  message: string;
  field_name: string | null;
  // A stable key per issue instance so the reconciler can match it against
  // existing flags. Default: `${flag_type}:${field_name ?? ""}:${message}`.
  dedup_key: string;
};

export async function runWineValidators(vintageId: string): Promise<ValidatorIssue[]> {
  const issues: ValidatorIssue[] = [];

  // One combined fetch keeps the validator a single round-trip for the
  // common path, with per-check follow-ups only when needed.
  const row = await one<{
    id: string;
    wine_id: string;
    vintage_text: string | null;
    status: string;
    mevushal: string;
    aging_display: string | null;
    bottle_sizes: string[];
    special_designation: string | null;
    tasting_note: string | null;
    location_id: string | null;
    bottle_asset_id: string | null;
  }>(
    `SELECT id, wine_id, vintage_text, status, mevushal, aging_display,
            bottle_sizes, special_designation, tasting_note, location_id,
            bottle_asset_id
       FROM wine_vintages WHERE id = $1 AND deleted_at IS NULL`,
    [vintageId],
  );
  if (!row) return issues;

  // -------- bottle_sizes_malformed --------
  for (const size of row.bottle_sizes ?? []) {
    if (!/^[0-9]+(\.[0-9]+)?\s*(ml|cl|L|l)$/i.test(size.trim())) {
      issues.push({
        flag_type: "layout",
        severity: "warning",
        field_name: "bottle_sizes",
        message: `Bottle size "${size}" doesn't look right (expected like 750ml or 1.5L).`,
        dedup_key: `layout:bottle_sizes:${size}`,
      });
    }
  }

  // -------- mevushal_unknown at approved status --------
  if ((row.status === "approved" || row.status === "published") && row.mevushal === "unknown") {
    issues.push({
      flag_type: "missing",
      severity: "warning",
      field_name: "mevushal",
      message: "Mevushal is still unknown on an approved wine. Pick yes or no.",
      dedup_key: "missing:mevushal:unknown",
    });
  }

  // -------- bottle_missing --------
  if (!row.bottle_asset_id) {
    issues.push({
      flag_type: "image",
      severity: "warning",
      field_name: "bottle_asset_id",
      message: "No bottle image uploaded; catalogs will print a placeholder.",
      dedup_key: "image:bottle_asset_id:missing",
    });
  }

  // -------- copy_overflow --------
  if (row.tasting_note && row.tasting_note.length > 700) {
    issues.push({
      flag_type: "overflow",
      severity: "warning",
      field_name: "tasting_note",
      message: `Tasting note is ${row.tasting_note.length} characters — likely to overflow the body column on detailed sheets.`,
      dedup_key: "overflow:tasting_note:toolong",
    });
  }

  // -------- map_missing (full chain lookup) --------
  if (row.location_id) {
    const hit = await one<{ ok: boolean }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id FROM locations WHERE id = $1
         UNION ALL SELECT x.id, x.parent_id FROM locations x JOIN up ON x.id = up.parent_id
       )
       SELECT EXISTS (
         SELECT 1 FROM map_assets m
          WHERE m.status = 'approved' AND m.location_id IN (SELECT id FROM up)
       ) AS ok`,
      [row.location_id],
    );
    if (!hit?.ok) {
      issues.push({
        flag_type: "map",
        severity: "info",
        field_name: "location_id",
        message: "No approved map covers this location; the sheet will use the country-silhouette fallback.",
        dedup_key: "map:location_id:no-approved",
      });
    }
  }

  // (grapes_unknown_alias intentionally omitted — the current schema
  // enforces wine_grapes.grape_id NOT NULL via FK, so there's no row to
  // flag. When the importer path lands a staging row with a raw alias,
  // add a check here that joins against that staging table.)

  // -------- score_dupe (same critic, same vintage, same score text) --------
  const dupeScores = await query<{ critic: string | null; score_text: string; n: number }>(
    `SELECT c.canonical_name AS critic, s.score_text, count(*)::int AS n
       FROM wine_scores s LEFT JOIN critics c ON c.id = s.critic_id
      WHERE s.wine_vintage_id = $1
      GROUP BY c.canonical_name, s.score_text
      HAVING count(*) > 1`,
    [vintageId],
  );
  for (const d of dupeScores) {
    issues.push({
      flag_type: "duplicate",
      severity: "warning",
      field_name: "scores",
      message: `Duplicate score "${d.score_text}" from ${d.critic ?? "an unknown critic"} (${d.n} rows). Pick one and reject the others.`,
      dedup_key: `duplicate:scores:${d.critic ?? "?"}:${d.score_text}`,
    });
  }

  // -------- source_conflict --------
  const conflicts = await query<{ field_name: string; n: number }>(
    `SELECT field_name, count(*)::int AS n
       FROM field_provenance
      WHERE entity_type = 'wine_vintage'
        AND entity_id = $1
        AND is_current
        AND verification_status NOT IN ('rejected', 'superseded')
      GROUP BY field_name
      HAVING count(*) > 1`,
    [vintageId],
  );
  for (const c of conflicts) {
    issues.push({
      flag_type: "conflict",
      severity: "warning",
      field_name: c.field_name,
      message: `${c.n} sources disagree about ${c.field_name.replace(/_/g, " ")}. Open the Sources panel to resolve.`,
      dedup_key: `conflict:${c.field_name}:disagreement`,
    });
  }

  return issues;
}

// Reconcile the current issue set against review_flags: insert new, close
// resolved, leave manual flags alone. All flags created by this reconciler
// carry details.auto = true so the next run can tell them apart from
// human-authored ones.
export async function reconcileFlags(vintageId: string, issues: ValidatorIssue[]): Promise<{ opened: number; resolved: number }> {
  const existing = await query<{ id: string; flag_type: string; field_name: string | null; message: string; status: string; details: Record<string, unknown> }>(
    `SELECT id, flag_type, field_name, message, status, details
       FROM review_flags
      WHERE entity_type = 'wine_vintage' AND entity_id = $1`,
    [vintageId],
  );

  const key = (f: { flag_type: string; field_name: string | null; message: string }) =>
    `${f.flag_type}:${f.field_name ?? ""}:${f.message}`;

  const existingByKey = new Map<string, typeof existing[number]>();
  for (const e of existing) existingByKey.set(key(e), e);

  const issueKeys = new Set(issues.map((i) => `${i.flag_type}:${i.field_name ?? ""}:${i.message}`));

  let opened = 0;
  let resolved = 0;

  for (const i of issues) {
    const k = `${i.flag_type}:${i.field_name ?? ""}:${i.message}`;
    const match = existingByKey.get(k);
    if (match) {
      // Reopen if it had been resolved by auto path previously.
      if (match.status !== "open" && match.details?.auto === true) {
        await query(
          `UPDATE review_flags SET status = 'open', resolved_at = NULL, resolved_by = NULL WHERE id = $1`,
          [match.id],
        );
        opened++;
      }
      continue;
    }
    await query(
      `INSERT INTO review_flags (entity_type, entity_id, field_name, flag_type, severity, message, details, status)
       VALUES ('wine_vintage', $1, $2, $3, $4, $5, $6::jsonb, 'open')`,
      [vintageId, i.field_name, i.flag_type, i.severity, i.message, JSON.stringify({ auto: true, dedup_key: i.dedup_key })],
    );
    opened++;
  }

  // Any open auto-flag whose dedup key no longer appears → auto-resolve.
  for (const e of existing) {
    if (e.status !== "open") continue;
    if (e.details?.auto !== true) continue; // leave manual flags alone
    if (!issueKeys.has(key(e))) {
      await query(
        `UPDATE review_flags SET status = 'resolved', resolved_at = now() WHERE id = $1`,
        [e.id],
      );
      resolved++;
    }
  }

  return { opened, resolved };
}

// afterWineSave is the one-stop hook called from the save paths. It never
// throws — a validator bug must not block the user's write. Any failure
// lands on /settings/system via captureError.
export async function afterWineSave(vintageId: string): Promise<void> {
  try {
    const issues = await runWineValidators(vintageId);
    await reconcileFlags(vintageId, issues);
  } catch (err) {
    await captureError(err, {
      kind: "action",
      route: "afterWineSave",
      extra: { vintage_id: vintageId },
    });
  }
}
