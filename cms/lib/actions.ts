"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireEditor, requireUser, type Role } from "./auth";
import { one, query } from "./db";
import { audit } from "./audit";
import { adminAuth } from "./firebase-admin";
import { levenshtein } from "./text";

// ---------------------------------------------------------------- review flags
export async function bulkSetFlagStatus(formData: FormData) {
  const user = await requireEditor();
  const status = String(formData.get("status") ?? "");
  if (!["resolved", "dismissed", "open"].includes(status)) return;
  const idsCsv = String(formData.get("ids") ?? "");
  const ids = idsCsv.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return;
  await query(
    `UPDATE review_flags SET status = $2,
       resolved_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3::uuid END,
       resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
     WHERE id = ANY($1::uuid[])`,
    [ids, status, user.id],
  );
  await audit(user.id, `flag.bulk_${status}`, { type: "review_flag", id: ids.join(",") }, { new: { count: ids.length } });
  revalidatePath("/review");
}

export async function setFlagStatus(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["resolved", "dismissed", "open"].includes(status)) return;
  const before = await one<{ status: string }>("SELECT status FROM review_flags WHERE id = $1", [id]);
  if (!before) return;
  await query(
    `UPDATE review_flags SET status = $2,
       resolved_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3::uuid END,
       resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
     WHERE id = $1`,
    [id, status, user.id],
  );
  await audit(user.id, `flag.${status}`, { type: "review_flag", id }, { old: before.status, new: status });
  revalidatePath("/review");
  revalidatePath("/wines", "layout");
}

// ---------------------------------------------------------------- users (Admin only)
export type UserActionResult = { ok: boolean; message: string; link?: string };

export async function createUser(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "editor") as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!["admin", "editor"].includes(role)) return { ok: false, message: "Choose Admin or Editor." };
  if (await one("SELECT 1 FROM users WHERE lower(email) = $1", [email])) {
    return { ok: false, message: "That email already has an account." };
  }

  const auth = adminAuth();
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await auth.createUser({ email, displayName: displayName ?? undefined, emailVerified: false })).uid;
  }
  const row = await one<{ id: string }>(
    "INSERT INTO users (firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id",
    [uid, email, displayName, role],
  );
  await audit(admin.id, "user.create", { type: "user", id: row!.id }, { new: { email, role } });

  // A one-time link the new user opens to choose their own password.
  const link = await auth.generatePasswordResetLink(email);
  revalidatePath("/users");
  return {
    ok: true,
    message: `Account created for ${email}. Send them this link to set their password (it expires after one use or about an hour):`,
    link,
  };
}

export async function resetLink(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const u = await one<{ email: string }>("SELECT email FROM users WHERE id = $1", [id]);
  if (!u) return { ok: false, message: "User not found." };
  const link = await adminAuth().generatePasswordResetLink(u.email);
  await audit(admin.id, "user.password_reset_link", { type: "user", id });
  return { ok: true, message: `Password link for ${u.email}:`, link };
}

export async function updateUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = formData.get("role") ? (String(formData.get("role")) as Role) : null;
  const active = formData.get("active") !== null ? formData.get("active") === "true" : null;
  const u = await one<{ id: string; role: Role; active: boolean; firebase_uid: string | null }>(
    "SELECT id, role, active, firebase_uid FROM users WHERE id = $1",
    [id],
  );
  if (!u) return;

  const losingAdmin = u.role === "admin" && ((role && role !== "admin") || active === false);
  if (losingAdmin) {
    const admins = await one<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
    if ((admins?.n ?? 0) <= 1) return; // never remove the last active Admin
  }
  if (id === admin.id && (active === false || (role && role !== "admin"))) return; // can't lock yourself out

  if (role && ["admin", "editor"].includes(role) && role !== u.role) {
    await query("UPDATE users SET role = $2, updated_at = now() WHERE id = $1", [id, role]);
    await audit(admin.id, "user.role", { type: "user", id, field: "role" }, { old: u.role, new: role });
  }
  if (active !== null && active !== u.active) {
    await query("UPDATE users SET active = $2, updated_at = now() WHERE id = $1", [id, active]);
    if (u.firebase_uid) {
      await adminAuth().updateUser(u.firebase_uid, { disabled: !active });
      if (!active) await adminAuth().revokeRefreshTokens(u.firebase_uid);
    }
    await audit(admin.id, active ? "user.reactivate" : "user.deactivate", { type: "user", id, field: "active" }, { old: u.active, new: active });
  }
  revalidatePath("/users");
}

// =============================================================================
// Wine vintage editing
// =============================================================================

const STATUSES = ["draft", "needs_review", "approved", "published", "discontinued"] as const;
type VintageStatus = (typeof STATUSES)[number];
const MEVUSHAL = ["yes", "no", "unknown"] as const;
type Mevushal = (typeof MEVUSHAL)[number];

function s(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function b3(formData: FormData, key: string): boolean | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  const t = String(v).toLowerCase();
  if (t === "yes" || t === "true") return true;
  if (t === "no" || t === "false") return false;
  return null;
}

function arr(formData: FormData, key: string): string[] {
  const v = s(formData, key);
  if (!v) return [];
  return v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
}

type VintageRow = {
  id: string;
  wine_id: string;
  vintage_text: string | null;
  status: VintageStatus;
  mevushal: Mevushal;
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

// Update the main set of vintage fields in a single save. Each change is audited.
export async function updateWineVintage(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const before = await one<VintageRow>(
    `SELECT id, wine_id, vintage_text, status, mevushal, supervision_display, aging_display,
            bottle_sizes, special_designation, tasting_note, food_pairing, short_description,
            first_kosher_vintage, organic, biodynamic, wine_story
     FROM wine_vintages WHERE id = $1`,
    [id],
  );
  if (!before) return;

  const next = {
    vintage_text: s(formData, "vintage_text"),
    status: (STATUSES as readonly string[]).includes(String(formData.get("status")))
      ? (String(formData.get("status")) as VintageStatus)
      : before.status,
    mevushal: (MEVUSHAL as readonly string[]).includes(String(formData.get("mevushal")))
      ? (String(formData.get("mevushal")) as Mevushal)
      : before.mevushal,
    supervision_display: s(formData, "supervision_display"),
    aging_display: s(formData, "aging_display"),
    bottle_sizes: arr(formData, "bottle_sizes"),
    special_designation: s(formData, "special_designation"),
    tasting_note: s(formData, "tasting_note"),
    food_pairing: s(formData, "food_pairing"),
    short_description: s(formData, "short_description"),
    first_kosher_vintage: b3(formData, "first_kosher_vintage"),
    organic: b3(formData, "organic"),
    biodynamic: b3(formData, "biodynamic"),
    wine_story: s(formData, "wine_story"),
  };

  // Only persist what actually changed; keeps the audit log clean.
  const diffs: { field: string; old: unknown; new: unknown }[] = [];
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const a = before[key];
    const n = next[key];
    const same = Array.isArray(a) && Array.isArray(n) ? a.join("|") === (n as string[]).join("|") : a === n;
    if (!same) diffs.push({ field: key, old: a, new: n });
  }
  if (diffs.length === 0) {
    revalidatePath(`/wines/${id}`);
    return;
  }

  await query(
    `UPDATE wine_vintages SET
       vintage_text = $2, status = $3, mevushal = $4, supervision_display = $5,
       aging_display = $6, bottle_sizes = $7, special_designation = $8,
       tasting_note = $9, food_pairing = $10, short_description = $11,
       first_kosher_vintage = $12, organic = $13, biodynamic = $14, wine_story = $15,
       reviewed_at = CASE WHEN $3 = 'approved' AND status <> 'approved' THEN now() ELSE reviewed_at END,
       reviewed_by = CASE WHEN $3 = 'approved' AND status <> 'approved' THEN $16::uuid ELSE reviewed_by END,
       approved_at = CASE WHEN $3 = 'approved' AND status <> 'approved' THEN now() ELSE approved_at END,
       approved_by = CASE WHEN $3 = 'approved' AND status <> 'approved' THEN $16::uuid ELSE approved_by END,
       published_at = CASE WHEN $3 = 'published' AND status <> 'published' THEN now() ELSE published_at END,
       updated_at = now()
     WHERE id = $1`,
    [
      id, next.vintage_text, next.status, next.mevushal, next.supervision_display,
      next.aging_display, next.bottle_sizes, next.special_designation,
      next.tasting_note, next.food_pairing, next.short_description,
      next.first_kosher_vintage, next.organic, next.biodynamic, next.wine_story,
      user.id,
    ],
  );
  for (const d of diffs) {
    await audit(user.id, "wine_vintage.update", { type: "wine_vintage", id, field: d.field }, { old: d.old, new: d.new });
  }
  revalidatePath(`/wines/${id}`);
  revalidatePath("/wines", "layout");
}

// =============================================================================
// Add vintage: blank or duplicated from the most recent one
// =============================================================================

export async function addVintage(formData: FormData) {
  const user = await requireEditor();
  const wineId = String(formData.get("wine_id") ?? "");
  const vintage = (s(formData, "vintage_text") ?? "").trim() || null;
  const duplicate = formData.get("duplicate") === "on" || formData.get("duplicate") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(wineId)) return;

  const existing = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM wine_vintages WHERE wine_id = $1 AND vintage_text IS NOT DISTINCT FROM $2 AND deleted_at IS NULL",
    [wineId, vintage],
  );
  if ((existing?.n ?? 0) > 0) {
    redirect(`/wines?q=${encodeURIComponent(vintage ?? "")}&error=exists`);
  }

  let newId: string;
  if (duplicate) {
    const prev = await one<{ id: string }>(
      `SELECT id FROM wine_vintages
       WHERE wine_id = $1 AND deleted_at IS NULL
       ORDER BY vintage_text DESC NULLS LAST LIMIT 1`,
      [wineId],
    );
    if (!prev) {
      // No source to copy from; fall through to blank insert.
      const r = await one<{ id: string }>(
        "INSERT INTO wine_vintages (wine_id, vintage_text, status) VALUES ($1, $2, 'draft') RETURNING id",
        [wineId, vintage],
      );
      newId = r!.id;
    } else {
      const r = await one<{ id: string }>(
        `INSERT INTO wine_vintages (
           wine_id, vintage_text, status, display_title_override, location_id, mevushal,
           supervision_display, aging_display, bottle_sizes, special_designation,
           first_kosher_vintage, organic, biodynamic, tasting_note, winery_note_override,
           wine_story, food_pairing, short_description, catalog_note, bottle_asset_id,
           bottle_family, bottle_scale_override, bottle_x_override, bottle_y_override,
           map_asset_override_id, theme_override,
           duplicated_from_id,
           carried_forward_fields)
         SELECT wine_id, $2, 'needs_review', display_title_override, location_id, mevushal,
                supervision_display, aging_display, bottle_sizes, special_designation,
                FALSE AS first_kosher_vintage,   -- never carry forward; it is vintage-specific
                organic, biodynamic, tasting_note, winery_note_override,
                wine_story, food_pairing, short_description, catalog_note, bottle_asset_id,
                bottle_family, bottle_scale_override, bottle_x_override, bottle_y_override,
                map_asset_override_id, theme_override,
                id,
                ARRAY['mevushal','supervision_display','aging_display','bottle_sizes',
                      'special_designation','organic','biodynamic',
                      'tasting_note','food_pairing','grapes','location_id']::text[]
         FROM wine_vintages WHERE id = $1
         RETURNING id`,
        [prev.id, vintage],
      );
      newId = r!.id;
      // Copy grapes from the source.
      await query(
        `INSERT INTO wine_grapes (wine_vintage_id, grape_id, percentage, display_order)
         SELECT $1, grape_id, percentage, display_order FROM wine_grapes WHERE wine_vintage_id = $2`,
        [newId, prev.id],
      );
      // Copy supervision authorities.
      await query(
        `INSERT INTO wine_supervision (wine_vintage_id, authority_id, display_order)
         SELECT $1, authority_id, display_order FROM wine_supervision WHERE wine_vintage_id = $2`,
        [newId, prev.id],
      );
      // Flag that this is carried forward.
      await query(
        `INSERT INTO review_flags (entity_type, entity_id, flag_type, severity, message)
         VALUES ('wine_vintage', $1, 'new_vintage', 'info',
                 $2)`,
        [newId, `Carried forward from vintage ${(await one<{ v: string | null }>("SELECT vintage_text AS v FROM wine_vintages WHERE id = $1", [prev.id]))?.v ?? "previous"}. Review every field before approval.`],
      );
    }
  } else {
    const r = await one<{ id: string }>(
      "INSERT INTO wine_vintages (wine_id, vintage_text, status) VALUES ($1, $2, 'draft') RETURNING id",
      [wineId, vintage],
    );
    newId = r!.id;
  }

  await audit(user.id, duplicate ? "wine_vintage.duplicate" : "wine_vintage.create",
    { type: "wine_vintage", id: newId }, { new: { wine_id: wineId, vintage_text: vintage } });
  revalidatePath(`/wines`, "layout");
  redirect(`/wines/${newId}`);
}

// =============================================================================
// Score add / update / delete
// =============================================================================

type ScoreRow = {
  id: string;
  wine_vintage_id: string;
  critic_id: string | null;
  score_text: string;
  numeric_score: string | null;
  award_text: string | null;
  review_year: number | null;
  review_url: string | null;
  is_primary: boolean;
  raw_text: string | null;
};

async function resolveCriticId(criticName: string): Promise<string | null> {
  const name = criticName.trim();
  if (!name) return null;
  const existing = await one<{ id: string }>(
    `SELECT id FROM critics
     WHERE lower(canonical_name) = lower($1)
        OR lower($1) = ANY(array(SELECT lower(unnest(aliases))))`,
    [name],
  );
  if (existing) return existing.id;
  const r = await one<{ id: string }>(
    "INSERT INTO critics (canonical_name) VALUES ($1) RETURNING id",
    [name],
  );
  return r?.id ?? null;
}

function parseScoreNumeric(text: string): number | null {
  const t = text.trim();
  const m = t.match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

export async function saveScore(formData: FormData) {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  const scoreId = s(formData, "id");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return;

  const criticName = s(formData, "critic") ?? "";
  const scoreText = s(formData, "score_text") ?? "";
  if (!scoreText) return;
  const awardText = s(formData, "award_text");
  const reviewYear = (() => {
    const n = s(formData, "review_year");
    if (!n) return null;
    const y = parseInt(n, 10);
    return y >= 1900 && y <= 2100 ? y : null;
  })();
  const reviewUrl = s(formData, "review_url");
  const isPrimary = formData.get("is_primary") === "on" || formData.get("is_primary") === "true";
  const rawText = s(formData, "raw_text");
  const criticId = criticName ? await resolveCriticId(criticName) : null;
  const numeric = parseScoreNumeric(scoreText);

  if (scoreId) {
    const before = await one<ScoreRow>("SELECT * FROM wine_scores WHERE id = $1", [scoreId]);
    if (!before) return;
    await query(
      `UPDATE wine_scores SET critic_id = $2, score_text = $3, numeric_score = $4,
         award_text = $5, review_year = $6, review_url = $7, is_primary = $8, raw_text = $9
       WHERE id = $1`,
      [scoreId, criticId, scoreText, numeric, awardText, reviewYear, reviewUrl, isPrimary, rawText],
    );
    await audit(user.id, "score.update", { type: "wine_score", id: scoreId },
      { old: { critic: before.critic_id, score: before.score_text }, new: { critic: criticId, score: scoreText } });
  } else {
    const r = await one<{ id: string }>(
      `INSERT INTO wine_scores
         (wine_vintage_id, critic_id, score_text, numeric_score, award_text, review_year, review_url, is_primary, raw_text, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               coalesce((SELECT max(display_order) + 1 FROM wine_scores WHERE wine_vintage_id = $1), 0))
       RETURNING id`,
      [vintageId, criticId, scoreText, numeric, awardText, reviewYear, reviewUrl, isPrimary, rawText],
    );
    await audit(user.id, "score.create", { type: "wine_score", id: r!.id },
      { new: { wine_vintage_id: vintageId, critic: criticId, score: scoreText } });
  }
  // Bump updated_at so the live preview reloads.
  await query("UPDATE wine_vintages SET updated_at = now() WHERE id = $1", [vintageId]);
  revalidatePath(`/wines/${vintageId}`);
}

export async function deleteScore(formData: FormData) {
  const user = await requireEditor();
  const scoreId = String(formData.get("id") ?? "");
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(scoreId)) return;
  const before = await one<{ score_text: string; wine_vintage_id: string }>(
    "SELECT score_text, wine_vintage_id FROM wine_scores WHERE id = $1",
    [scoreId],
  );
  if (!before) return;
  await query("DELETE FROM wine_scores WHERE id = $1", [scoreId]);
  await query("UPDATE wine_vintages SET updated_at = now() WHERE id = $1",
    [vintageId || before.wine_vintage_id]);
  await audit(user.id, "score.delete", { type: "wine_score", id: scoreId }, { old: before });
  revalidatePath(`/wines/${vintageId || before.wine_vintage_id}`);
}

// =============================================================================
// Grape management
// =============================================================================

async function resolveGrapeId(name: string, color?: string | null): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const existing = await one<{ id: string }>(
    "SELECT id FROM grapes WHERE lower(canonical_name) = lower($1) OR lower($1) = ANY(array(SELECT lower(unnest(aliases))))",
    [n],
  );
  if (existing) return existing.id;
  // Not auto-creating: a typo like "Cabarnet" would otherwise become a new canonical grape.
  // Caller is responsible for recording a review flag.
  return null;
}

// Levenshtein distance (small implementation; enough for one-off nearest-match look-ups).
async function suggestGrape(name: string): Promise<string | null> {
  const all = await query<{ canonical_name: string }>("SELECT canonical_name FROM grapes");
  const n = name.toLowerCase();
  let best: { name: string; d: number } | null = null;
  for (const row of all) {
    const d = levenshtein(n, row.canonical_name.toLowerCase());
    if (d <= 2 && (!best || d < best.d)) best = { name: row.canonical_name, d };
  }
  return best?.name ?? null;
}

export async function replaceGrapes(formData: FormData) {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return;
  // Comma-separated "60% Merlot, 40% Cabernet Franc" or just names.
  const text = s(formData, "grapes_text") ?? "";
  const parts = text.split(/\s*,\s*/).filter(Boolean);
  const unknown: { name: string; suggestion: string | null }[] = [];
  await query("DELETE FROM wine_grapes WHERE wine_vintage_id = $1", [vintageId]);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const m = p.match(/^(\d+(?:\.\d+)?)%\s*(.+)$/);
    const pct = m ? parseFloat(m[1]) : null;
    const name = m ? m[2].trim() : p.trim();
    const gid = await resolveGrapeId(name);
    if (!gid) {
      unknown.push({ name, suggestion: await suggestGrape(name) });
      continue;
    }
    await query(
      "INSERT INTO wine_grapes (wine_vintage_id, grape_id, percentage, display_order) VALUES ($1, $2, $3, $4) ON CONFLICT (wine_vintage_id, grape_id) DO UPDATE SET percentage = EXCLUDED.percentage, display_order = EXCLUDED.display_order",
      [vintageId, gid, pct, i],
    );
  }
  // Record each unknown grape as a review flag so the editor sees it (and can
  // add the grape to the master list from the Grapes admin — not from here).
  for (const u of unknown) {
    const msg = u.suggestion
      ? `Grape "${u.name}" is not in the master list. Did you mean "${u.suggestion}"?`
      : `Grape "${u.name}" is not in the master list. Add it from Grapes admin before using it.`;
    await query(
      `INSERT INTO review_flags (entity_type, entity_id, flag_type, severity, message, field_name)
       VALUES ('wine_vintage', $1, 'missing', 'warning', $2, 'grapes')`,
      [vintageId, msg],
    );
  }
  // Bump the vintage's updated_at so the live-preview iframe knows to reload.
  await query("UPDATE wine_vintages SET updated_at = now() WHERE id = $1", [vintageId]);
  await audit(user.id, "wine_vintage.grapes.update",
    { type: "wine_vintage", id: vintageId, field: "grapes" },
    { new: text }, { unknown: unknown.map((u) => u.name) });
  revalidatePath(`/wines/${vintageId}`);
}

// =============================================================================
// Catalogs
// =============================================================================

const RENDER_MODES = ["detailed", "editorial", "portfolio", "compact", "hybrid"] as const;
const SECTION_KINDS = [
  "cover", "intro", "toc", "regional_index", "divider", "producer_intro",
  "wines", "producer_index", "contact", "back_cover",
] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

// Create a catalog from a bare name and (optionally) a starter list of wines.
// Scaffolds the default section skeleton so the user doesn't start empty.
// Phase D — preflight before export (audit § 33-34).
// Walks every wine in a catalog, counts missing bottles, low-res bottles,
// missing scores, missing tasting notes, long tasting notes, missing maps,
// and reports back with friendly language. Warnings never block an export;
// only fatal issues do (missing records or 0 wines).
export type PreflightItem = {
  severity: "fatal" | "warning";
  category: string;
  message: string;
  count: number;
};
export type PreflightReport = {
  wine_count: number;
  bottle_ready: number;
  warnings: PreflightItem[];
  fatals: PreflightItem[];
  can_generate: boolean;
};
export async function preflightCatalog(formData: FormData): Promise<{ ok: boolean; report?: PreflightReport; message?: string }> {
  await requireUser();
  const catalogId = String(formData.get("catalog_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return { ok: false, message: "Invalid catalog id." };

  const row = await one<{ wine_count: number }>(
    `SELECT count(*)::int AS wine_count FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL`,
    [catalogId],
  );
  const wineCount = row?.wine_count ?? 0;

  if (wineCount === 0) {
    return {
      ok: true,
      report: {
        wine_count: 0,
        bottle_ready: 0,
        warnings: [],
        fatals: [{ severity: "fatal", category: "no_wines", message: "This catalog has no wines yet.", count: 0 }],
        can_generate: false,
      },
    };
  }

  // One round-trip per check — cheap on Postgres, keeps the report page simple.
  const [bottles, scores, notes, longNotes, lowRes, missingMaps] = await Promise.all([
    one<{ n: number; m: number }>(
      `SELECT
         count(*) FILTER (
           WHERE v.bottle_asset_id IS NOT NULL
              OR (v.legacy->>'img') IS NOT NULL
         )::int AS n,
         count(*)::int AS m
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL`,
      [catalogId],
    ),
    one<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM wine_scores s WHERE s.wine_vintage_id = v.id)`,
      [catalogId],
    ),
    one<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL
         AND coalesce(v.tasting_note, '') = ''`,
      [catalogId],
    ),
    one<{ n: number; too_long: number }>(
      // Phase 29 — mirror the two-band bottle quality: ">450 might, >700 will".
      // n is still the overall count of over-standard notes (keeps backwards
      // compatibility with any later consumer); too_long is the strict band
      // that gets its own warning line.
      `SELECT
         count(*) FILTER (WHERE length(coalesce(v.tasting_note, '')) > 450)::int AS n,
         count(*) FILTER (WHERE length(coalesce(v.tasting_note, '')) > 700)::int AS too_long
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL`,
      [catalogId],
    ),
    one<{ n: number; too_small: number }>(
      // Phase 28 — split the single "low-res" count into two bands so the
      // workspace and preflight agree on severity (fatal < 400 vs low < 800).
      `SELECT
         count(*) FILTER (WHERE a.width_px IS NOT NULL AND a.width_px < 800)::int AS n,
         count(*) FILTER (WHERE a.width_px IS NOT NULL AND a.width_px < 400)::int AS too_small
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       JOIN assets a ON a.id = v.bottle_asset_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL
         AND a.deleted_at IS NULL`,
      [catalogId],
    ),
    one<{ n: number }>(
      `SELECT count(DISTINCT v.location_id)::int AS n
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       WHERE ci.catalog_id = $1 AND v.deleted_at IS NULL
         AND v.location_id IS NOT NULL
         AND NOT EXISTS (
           WITH RECURSIVE up AS (
             SELECT id, parent_id FROM locations WHERE id = v.location_id
             UNION ALL SELECT x.id, x.parent_id FROM locations x JOIN up ON x.id = up.parent_id
           )
           SELECT 1 FROM map_assets m
             WHERE m.status = 'approved' AND m.location_id IN (SELECT id FROM up)
         )`,
      [catalogId],
    ),
  ]);

  const warnings: PreflightItem[] = [];
  const bottleMissing = (bottles?.m ?? 0) - (bottles?.n ?? 0);
  if (bottleMissing > 0) warnings.push({ severity: "warning", category: "bottle_missing", message: `${bottleMissing} wine${bottleMissing === 1 ? "" : "s"} without a bottle image — a placeholder will print instead.`, count: bottleMissing });
  // Phase 28 — the lowRes count already includes the too-small count; subtract
  // so each wine appears in exactly one bucket (merely low vs. too-small).
  const lowResCount = Math.max(0, (lowRes?.n ?? 0) - (lowRes?.too_small ?? 0));
  if ((lowRes?.too_small ?? 0) > 0) warnings.push({ severity: "warning", category: "bottle_toosmall", message: `${lowRes!.too_small} bottle image${lowRes!.too_small === 1 ? "" : "s"} below our 400px export minimum — please upload larger versions.`, count: lowRes!.too_small });
  if (lowResCount > 0) warnings.push({ severity: "warning", category: "bottle_lowres", message: `${lowResCount} low-resolution bottle${lowResCount === 1 ? "" : "s"} (under 800px wide) — may look soft when printed.`, count: lowResCount });
  if ((scores?.n ?? 0) > 0) warnings.push({ severity: "warning", category: "no_scores", message: `${scores!.n} wine${scores!.n === 1 ? "" : "s"} without any critic score.`, count: scores!.n });
  if ((notes?.n ?? 0) > 0) warnings.push({ severity: "warning", category: "no_tasting_note", message: `${notes!.n} wine${notes!.n === 1 ? "" : "s"} without a tasting note.`, count: notes!.n });
  // Phase 29 — split long-note count by severity, same shape as bottles.
  const longOnly = Math.max(0, (longNotes?.n ?? 0) - (longNotes?.too_long ?? 0));
  if ((longNotes?.too_long ?? 0) > 0) warnings.push({ severity: "warning", category: "note_toolong", message: `${longNotes!.too_long} tasting note${longNotes!.too_long === 1 ? "" : "s"} over 700 characters — will likely overflow the body column; please trim.`, count: longNotes!.too_long });
  if (longOnly > 0) warnings.push({ severity: "warning", category: "long_tasting_note", message: `${longOnly} tasting note${longOnly === 1 ? "" : "s"} longer than 450 characters — may need a smaller font on detailed sheets.`, count: longOnly });
  if ((missingMaps?.n ?? 0) > 0) warnings.push({ severity: "warning", category: "missing_map", message: `${missingMaps!.n} location${missingMaps!.n === 1 ? "" : "s"} without an approved map — the sheet will use the country-silhouette fallback.`, count: missingMaps!.n });

  return {
    ok: true,
    report: {
      wine_count: wineCount,
      bottle_ready: bottles?.n ?? 0,
      warnings,
      fatals: [],
      can_generate: true,
    },
  };
}

export async function createCatalog(formData: FormData) {
  const user = await requireEditor();
  const name = (s(formData, "name") ?? "").trim();
  const season = s(formData, "season");
  const renderMode = ((RENDER_MODES as readonly string[]).includes(String(formData.get("render_mode")))
    ? (String(formData.get("render_mode")) as (typeof RENDER_MODES)[number])
    : "hybrid");
  const wineIdsRaw = String(formData.get("wine_vintage_ids") ?? "").trim();
  const wineIds = wineIdsRaw
    ? wineIdsRaw.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x))
    : [];
  if (!name) return;

  const c = await one<{ id: string }>(
    "INSERT INTO catalogs (name, season, render_mode, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, season, renderMode, user.id],
  );
  const catalogId = c!.id;

  // Default skeleton — the user can rearrange or delete any of these.
  const defaults: { kind: SectionKind; title: string }[] = [
    { kind: "cover", title: name },
    { kind: "intro", title: "M&M Imports" },
    { kind: "toc", title: "Contents" },
    { kind: "regional_index", title: "Regional Index" },
    { kind: "wines", title: "The Wines" },
    { kind: "producer_index", title: "Producer Index" },
    { kind: "contact", title: "Contact" },
    { kind: "back_cover", title: "Back Cover" },
  ];
  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    await query(
      "INSERT INTO catalog_sections (catalog_id, kind, title, position) VALUES ($1, $2, $3, $4)",
      [catalogId, d.kind, d.title, i],
    );
  }
  // Attach the preselected wines to the Wines section.
  if (wineIds.length) {
    const sec = await one<{ id: string }>(
      "SELECT id FROM catalog_sections WHERE catalog_id = $1 AND kind = 'wines' ORDER BY position LIMIT 1",
      [catalogId],
    );
    for (let i = 0; i < wineIds.length; i++) {
      await query(
        "INSERT INTO catalog_items (catalog_id, section_id, wine_vintage_id, position) VALUES ($1, $2, $3, $4)",
        [catalogId, sec?.id ?? null, wineIds[i], i],
      );
    }
  }
  await audit(user.id, "catalog.create", { type: "catalog", id: catalogId },
    { new: { name, render_mode: renderMode, wine_count: wineIds.length } });
  revalidatePath("/catalogs");
  redirect(`/catalogs/${catalogId}`);
}

// Price tiers the catalog is allowed to showcase on its Trade pages.
// Mirror lib/xlsx.ts PRICE_TIERS; a catalog "ladder" setting shows the full
// list rather than a single column. NOT exported — Next 16.4 requires every
// export from a "use server" file to be an async function.
const CATALOG_PRICE_TIERS = [
  "ladder", "frontline", "2cs", "3cs", "4cs", "5cs", "10cs", "25cs",
] as const;
type CatalogPriceTier = typeof CATALOG_PRICE_TIERS[number];

export async function renameCatalog(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const name = (s(formData, "name") ?? "").trim();
  const season = s(formData, "season");
  const renderMode = (RENDER_MODES as readonly string[]).includes(String(formData.get("render_mode")))
    ? String(formData.get("render_mode"))
    : null;
  const showPrices = String(formData.get("show_prices") ?? "") === "on";
  const priceTierRaw = String(formData.get("price_tier") ?? "");
  const priceTier: CatalogPriceTier =
    (CATALOG_PRICE_TIERS as readonly string[]).includes(priceTierRaw)
      ? (priceTierRaw as CatalogPriceTier)
      : "ladder";
  const showStock = String(formData.get("show_stock") ?? "") === "on";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !name) return;
  await query(
    `UPDATE catalogs
       SET name = $2, season = $3,
           render_mode = COALESCE($4, render_mode),
           settings = jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(settings, '{}'::jsonb), '{show_prices}', to_jsonb($5::bool)),
               '{price_tier}', to_jsonb($6::text)
             ),
             '{show_stock}', to_jsonb($7::bool)
           ),
           updated_at = now()
     WHERE id = $1`,
    [id, name, season, renderMode, showPrices, priceTier, showStock],
  );
  await audit(user.id, "catalog.update", { type: "catalog", id }, { new: {
    name, season, render_mode: renderMode, show_prices: showPrices, price_tier: priceTier, show_stock: showStock,
  } });
  revalidatePath(`/catalogs/${id}`);
  revalidatePath("/catalogs");
}

export async function deleteCatalog(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  // Catalog deletion only unlinks the composition; versioned exports are kept.
  await query("DELETE FROM catalog_items WHERE catalog_id = $1", [id]);
  await query("DELETE FROM catalog_sections WHERE catalog_id = $1", [id]);
  await query("UPDATE catalogs SET status = 'archived', updated_at = now() WHERE id = $1", [id]);
  await audit(user.id, "catalog.archive", { type: "catalog", id });
  revalidatePath("/catalogs");
  redirect("/catalogs");
}

export async function addCatalogSection(formData: FormData) {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  const kind = String(formData.get("kind") ?? "") as SectionKind;
  const title = (s(formData, "title") ?? "").trim() || kind;
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return;
  if (!(SECTION_KINDS as readonly string[]).includes(kind)) return;
  const nextPos = await one<{ p: number }>(
    "SELECT coalesce(max(position) + 1, 0) AS p FROM catalog_sections WHERE catalog_id = $1",
    [catalogId],
  );
  const sec = await one<{ id: string }>(
    "INSERT INTO catalog_sections (catalog_id, kind, title, position) VALUES ($1, $2, $3, $4) RETURNING id",
    [catalogId, kind, title, nextPos?.p ?? 0],
  );
  await audit(user.id, "catalog_section.create", { type: "catalog_section", id: sec!.id }, { new: { kind, title } });
  revalidatePath(`/catalogs/${catalogId}`);
}

export async function moveCatalogSection(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["up", "down"].includes(direction)) return;
  const row = await one<{ catalog_id: string; position: number }>(
    "SELECT catalog_id, position FROM catalog_sections WHERE id = $1",
    [id],
  );
  if (!row) return;
  const neighbour = await one<{ id: string; position: number }>(
    direction === "up"
      ? "SELECT id, position FROM catalog_sections WHERE catalog_id = $1 AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM catalog_sections WHERE catalog_id = $1 AND position > $2 ORDER BY position ASC LIMIT 1",
    [row.catalog_id, row.position],
  );
  if (!neighbour) return;
  await query("UPDATE catalog_sections SET position = $2 WHERE id = $1", [id, neighbour.position]);
  await query("UPDATE catalog_sections SET position = $2 WHERE id = $1", [neighbour.id, row.position]);
  await audit(user.id, "catalog_section.move", { type: "catalog_section", id }, { new: { direction } });
  revalidatePath(`/catalogs/${row.catalog_id}`);
}

// Rewrite the full position order for all sections of a catalog. Called by
// the drag-to-reorder UI. The payload is a comma-separated list of section IDs
// in their new order.
export async function reorderCatalogSections(formData: FormData) {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return;
  const idsCsv = String(formData.get("ids") ?? "");
  const ids = idsCsv.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return;
  const checkOwnership = await query<{ id: string }>(
    "SELECT id FROM catalog_sections WHERE catalog_id = $1 AND id = ANY($2::uuid[])",
    [catalogId, ids],
  );
  const owned = new Set(checkOwnership.map((r) => r.id));
  for (let i = 0; i < ids.length; i++) {
    if (!owned.has(ids[i])) continue;
    await query("UPDATE catalog_sections SET position = $2 WHERE id = $1", [ids[i], i]);
  }
  await audit(user.id, "catalog.reorder_sections", { type: "catalog", id: catalogId }, { new: { count: ids.length } });
  revalidatePath(`/catalogs/${catalogId}`);
}

export async function reorderCatalogItems(formData: FormData) {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return;
  const idsCsv = String(formData.get("ids") ?? "");
  const ids = idsCsv.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return;
  // Verify every item belongs to this catalog.  The section id is optional —
  // if present we also move the item into that section.
  const owned = await query<{ id: string }>(
    "SELECT id FROM catalog_items WHERE catalog_id = $1 AND id = ANY($2::uuid[])",
    [catalogId, ids],
  );
  const ownedSet = new Set(owned.map((r) => r.id));
  // Figure out this section's position-base so items from different sections
  // keep increasing positions across the whole catalog (positions are catalog-wide).
  const basePos = sectionId && /^[0-9a-f-]{36}$/i.test(sectionId)
    ? (await one<{ min: number | null }>(
        "SELECT min(position) AS min FROM catalog_items WHERE catalog_id = $1 AND section_id = $2",
        [catalogId, sectionId],
      ))?.min ?? 0
    : 0;
  for (let i = 0; i < ids.length; i++) {
    if (!ownedSet.has(ids[i])) continue;
    const pos = basePos + i;
    if (sectionId && /^[0-9a-f-]{36}$/i.test(sectionId)) {
      await query(
        "UPDATE catalog_items SET position = $2, section_id = $3 WHERE id = $1",
        [ids[i], pos, sectionId],
      );
    } else {
      await query("UPDATE catalog_items SET position = $2 WHERE id = $1", [ids[i], pos]);
    }
  }
  await audit(user.id, "catalog.reorder_items", { type: "catalog", id: catalogId }, { new: { count: ids.length, section_id: sectionId || null } });
  revalidatePath(`/catalogs/${catalogId}`);
}

export async function deleteCatalogSection(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ catalog_id: string }>("SELECT catalog_id FROM catalog_sections WHERE id = $1", [id]);
  await query("DELETE FROM catalog_sections WHERE id = $1", [id]);
  if (row) {
    await audit(user.id, "catalog_section.delete", { type: "catalog_section", id });
    revalidatePath(`/catalogs/${row.catalog_id}`);
  }
}

export async function addWinesToCatalog(formData: FormData) {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  const sectionIdRaw = s(formData, "section_id");
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return;
  const ids = String(formData.get("wine_vintage_ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return;
  // Default to the first "wines" section if none specified.
  const sectionId =
    sectionIdRaw && /^[0-9a-f-]{36}$/i.test(sectionIdRaw)
      ? sectionIdRaw
      : (await one<{ id: string }>(
          "SELECT id FROM catalog_sections WHERE catalog_id = $1 AND kind = 'wines' ORDER BY position LIMIT 1",
          [catalogId],
        ))?.id ?? null;
  const existing = await one<{ p: number }>(
    "SELECT coalesce(max(position) + 1, 0) AS p FROM catalog_items WHERE catalog_id = $1",
    [catalogId],
  );
  let p = existing?.p ?? 0;
  for (const id of ids) {
    const dupe = await one<{ id: string }>(
      "SELECT id FROM catalog_items WHERE catalog_id = $1 AND wine_vintage_id = $2 LIMIT 1",
      [catalogId, id],
    );
    if (dupe) continue;
    await query(
      "INSERT INTO catalog_items (catalog_id, section_id, wine_vintage_id, position) VALUES ($1, $2, $3, $4)",
      [catalogId, sectionId, id, p++],
    );
  }
  await audit(user.id, "catalog.add_wines", { type: "catalog", id: catalogId }, { new: { count: ids.length } });
  revalidatePath(`/catalogs/${catalogId}`);
}

export type RemovedCatalogItem = {
  catalog_id: string;
  section_id: string | null;
  wine_vintage_id: string;
  position: number;
  render_mode_override: string | null;
};

export async function removeCatalogItem(formData: FormData): Promise<{ ok: boolean; removed?: RemovedCatalogItem }> {
  const user = await requireEditor();
  const itemId = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false };
  const row = await one<RemovedCatalogItem>(
    `SELECT catalog_id, section_id, wine_vintage_id, position, render_mode_override
       FROM catalog_items WHERE id = $1`,
    [itemId],
  );
  await query("DELETE FROM catalog_items WHERE id = $1", [itemId]);
  if (row) {
    await audit(user.id, "catalog_item.delete", { type: "catalog_item", id: itemId });
    revalidatePath(`/catalogs/${row.catalog_id}`);
    return { ok: true, removed: row };
  }
  return { ok: false };
}

// Partner to removeCatalogItem — used by the Undo toast.
export async function reinsertCatalogItem(formData: FormData) {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  const sectionRaw = String(formData.get("section_id") ?? "");
  const section = /^[0-9a-f-]{36}$/i.test(sectionRaw) ? sectionRaw : null;
  const position = parseInt(String(formData.get("position") ?? "0"), 10) || 0;
  const overrideRaw = String(formData.get("render_mode_override") ?? "");
  const override = overrideRaw || null;
  if (!/^[0-9a-f-]{36}$/i.test(catalogId) || !/^[0-9a-f-]{36}$/i.test(vintageId)) return;
  await query(
    `INSERT INTO catalog_items (catalog_id, section_id, wine_vintage_id, position, render_mode_override)
     VALUES ($1, $2, $3, $4, $5)`,
    [catalogId, section, vintageId, position, override],
  );
  await audit(user.id, "catalog_item.reinsert", { type: "catalog_item", id: vintageId });
  revalidatePath(`/catalogs/${catalogId}`);
}

export async function moveCatalogItem(formData: FormData) {
  const user = await requireEditor();
  const itemId = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(itemId) || !["up", "down"].includes(direction)) return;
  const row = await one<{ catalog_id: string; position: number }>(
    "SELECT catalog_id, position FROM catalog_items WHERE id = $1",
    [itemId],
  );
  if (!row) return;
  const neighbour = await one<{ id: string; position: number }>(
    direction === "up"
      ? "SELECT id, position FROM catalog_items WHERE catalog_id = $1 AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM catalog_items WHERE catalog_id = $1 AND position > $2 ORDER BY position ASC LIMIT 1",
    [row.catalog_id, row.position],
  );
  if (!neighbour) return;
  await query("UPDATE catalog_items SET position = $2 WHERE id = $1", [itemId, neighbour.position]);
  await query("UPDATE catalog_items SET position = $2 WHERE id = $1", [neighbour.id, row.position]);
  await audit(user.id, "catalog_item.move", { type: "catalog_item", id: itemId }, { new: { direction } });
  revalidatePath(`/catalogs/${row.catalog_id}`);
}

// Phase 30 — move an item from one Wines section to another. Keeps the
// row's position relative to the target section (lands at the end), and
// the catalog's overall position space stays contiguous because the
// reorderCatalogItems/removeCatalogItem path already renumbers.
export async function moveCatalogItemToSection(formData: FormData) {
  const user = await requireEditor();
  const itemId = String(formData.get("id") ?? "");
  const sectionIdRaw = String(formData.get("section_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false };
  const sectionId = sectionIdRaw && /^[0-9a-f-]{36}$/i.test(sectionIdRaw) ? sectionIdRaw : null;
  const row = await one<{ catalog_id: string; section_id: string | null; position: number }>(
    "SELECT catalog_id, section_id, position FROM catalog_items WHERE id = $1",
    [itemId],
  );
  if (!row) return { ok: false };

  // Validate that the target section (if non-null) exists on this catalog
  // and is of kind 'wines' — moving an item into a Cover makes no sense.
  if (sectionId) {
    const sec = await one<{ kind: string }>(
      "SELECT kind FROM catalog_sections WHERE id = $1 AND catalog_id = $2",
      [sectionId, row.catalog_id],
    );
    if (!sec) return { ok: false, message: "That section isn't in this catalog." };
    if (sec.kind !== "wines") return { ok: false, message: "Items can only move into a Wines section." };
  }

  // Land at the end of the target section — use the max position in that
  // section plus 1, which also keeps the catalog-wide position monotonic
  // (catalog_items.position is per-catalog, not per-section).
  const tail = await one<{ last: number | null }>(
    "SELECT max(position) AS last FROM catalog_items WHERE catalog_id = $1",
    [row.catalog_id],
  );
  const newPosition = (tail?.last ?? 0) + 1;
  await query(
    "UPDATE catalog_items SET section_id = $2, position = $3 WHERE id = $1",
    [itemId, sectionId, newPosition],
  );
  await audit(user.id, "catalog_item.move_section", { type: "catalog_item", id: itemId }, {
    new: { section_id: sectionId },
    old: { section_id: row.section_id },
  });
  revalidatePath(`/catalogs/${row.catalog_id}`);
  return { ok: true };
}

export async function setSectionRenderMode(formData: FormData) {
  const user = await requireEditor();
  const sectionId = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) return;
  if (!["detailed", "editorial", "portfolio", "lineup", "trade", "compact"].includes(mode)) return;
  const row = await one<{ catalog_id: string; settings: Record<string, unknown> }>(
    "SELECT catalog_id, settings FROM catalog_sections WHERE id = $1",
    [sectionId],
  );
  if (!row) return;
  const settings = { ...row.settings, layout: mode };
  await query("UPDATE catalog_sections SET settings = $2 WHERE id = $1", [sectionId, settings]);
  await audit(user.id, "catalog_section.layout", { type: "catalog_section", id: sectionId, field: "layout" }, { new: mode });
  revalidatePath(`/catalogs/${row.catalog_id}`);
}

// =============================================================================
// Bottle image assignment
// =============================================================================

export async function setBottleAsset(formData: FormData) {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  const assetIdRaw = s(formData, "asset_id");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return;
  const assetId = assetIdRaw && /^[0-9a-f-]{36}$/i.test(assetIdRaw) ? assetIdRaw : null;

  if (assetId) {
    const asset = await one<{ id: string }>("SELECT id FROM assets WHERE id = $1 AND deleted_at IS NULL", [assetId]);
    if (!asset) return;
    await query(
      `INSERT INTO wine_assets (wine_vintage_id, asset_id, role)
       VALUES ($1, $2, 'bottle') ON CONFLICT DO NOTHING`,
      [vintageId, assetId],
    );
  }
  await query(
    "UPDATE wine_vintages SET bottle_asset_id = $2, updated_at = now() WHERE id = $1",
    [vintageId, assetId],
  );
  await audit(user.id, "wine_vintage.bottle_asset", { type: "wine_vintage", id: vintageId, field: "bottle_asset_id" }, { new: assetId });
  revalidatePath(`/wines/${vintageId}`);
  revalidatePath(`/sheet/${vintageId}`);
}

// ---------------------------------------------------------------- single-field autosave
// Save one allow-listed text field on a wine vintage. Used by the autosave
// textarea in the Copy panel so the user can type freely and the save
// happens in the background.
const AUTOSAVE_WINE_VINTAGE_FIELDS = new Set([
  "tasting_note", "food_pairing", "short_description", "wine_story",
  "aging_display", "supervision_display", "special_designation",
]);

export async function autosaveWineVintageField(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Bad id." };
  if (!AUTOSAVE_WINE_VINTAGE_FIELDS.has(field)) {
    return { ok: false, message: `Field "${field}" is not autosaveable here.` };
  }
  const value = s(formData, "value");
  const before = await one<Record<string, unknown>>(
    `SELECT ${field} AS v FROM wine_vintages WHERE id = $1`,
    [id],
  );
  if (!before) return { ok: false, message: "Vintage not found." };
  if (before.v === value) return { ok: true };
  await query(
    `UPDATE wine_vintages SET ${field} = $2, updated_at = now() WHERE id = $1`,
    [id, value],
  );
  await audit(user.id, `wine_vintage.${field}`,
    { type: "wine_vintage", id, field },
    { old: before.v, new: value });
  revalidatePath(`/wines/${id}`);
  revalidatePath(`/sheet/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- assets
const ASSET_KINDS = ["bottle", "map", "logo", "photo", "document", "pdf", "other"] as const;
type AssetKind = (typeof ASSET_KINDS)[number];

export async function updateAssetMeta(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const before = await one<{ kind: string; file_name: string | null; metadata: Record<string, unknown> }>(
    "SELECT kind, file_name, metadata FROM assets WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  if (!before) return;

  const kindRaw = String(formData.get("kind") ?? "").trim();
  const kind: AssetKind = (ASSET_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as AssetKind)
    : (before.kind as AssetKind);
  const fileName = s(formData, "file_name") ?? before.file_name;
  const altText = s(formData, "alt_text") ?? "";
  const caption = s(formData, "caption") ?? "";
  const credit = s(formData, "credit_line") ?? "";
  const tagsCsv = s(formData, "tags") ?? "";
  const tags = tagsCsv
    ? tagsCsv.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const nextMeta = {
    ...(before.metadata ?? {}),
    alt_text: altText || undefined,
    caption: caption || undefined,
    credit_line: credit || undefined,
    tags: tags.length ? tags : undefined,
  };

  await query(
    `UPDATE assets SET kind = $2, file_name = $3, metadata = $4::jsonb WHERE id = $1`,
    [id, kind, fileName, JSON.stringify(nextMeta)],
  );
  await audit(user.id, "asset.update", { type: "asset", id }, {
    old: { kind: before.kind, file_name: before.file_name, metadata: before.metadata },
    new: { kind, file_name: fileName, metadata: nextMeta },
  });
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
}

export async function deleteAsset(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const asset = await one<{ id: string }>(
    "SELECT id FROM assets WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  if (!asset) return;
  await query("UPDATE assets SET deleted_at = now() WHERE id = $1", [id]);
  await query("UPDATE wine_vintages SET bottle_asset_id = NULL WHERE bottle_asset_id = $1", [id]);
  await audit(user.id, "asset.delete", { type: "asset", id });
  revalidatePath("/assets");
  redirect("/assets");
}

export async function bulkSetAssetKind(formData: FormData) {
  const user = await requireEditor();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  if (!(ASSET_KINDS as readonly string[]).includes(kindRaw)) return;
  const idsCsv = String(formData.get("ids") ?? "");
  const ids = idsCsv.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (ids.length === 0) return;
  await query(
    `UPDATE assets SET kind = $1 WHERE id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [kindRaw, ids],
  );
  await audit(user.id, "asset.bulk_kind", { type: "asset", id: ids.join(",") }, { new: { kind: kindRaw, count: ids.length } });
  revalidatePath("/assets");
}

export async function bulkDeleteAssets(formData: FormData) {
  const user = await requireEditor();
  const idsCsv = String(formData.get("ids") ?? "");
  const ids = idsCsv.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (ids.length === 0) return;
  await query(
    `UPDATE assets SET deleted_at = now() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [ids],
  );
  await query(
    `UPDATE wine_vintages SET bottle_asset_id = NULL WHERE bottle_asset_id = ANY($1::uuid[])`,
    [ids],
  );
  await audit(user.id, "asset.bulk_delete", { type: "asset", id: ids.join(",") }, { new: { count: ids.length } });
  revalidatePath("/assets");
}

// ---------------------------------------------------------------- maps
// A `map_asset` is a GeoJSON FeatureCollection scoped to one location. Each
// location can have several versions; one is approved at a time. The sheet
// walks up the location chain and picks the deepest approved map.
function parseGeoJson(raw: string): { ok: true; geo: unknown } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "GeoJSON is empty." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Expected a JSON object." };
  }
  const obj = parsed as { type?: unknown; features?: unknown; geometry?: unknown; properties?: unknown };
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features) && obj.features.length > 0) {
    return { ok: true, geo: parsed };
  }
  if (obj.type === "Feature" && obj.geometry) {
    // Wrap a bare Feature in a FeatureCollection so the renderer always sees one.
    return { ok: true, geo: { type: "FeatureCollection", features: [parsed] } };
  }
  if ((obj.type === "Polygon" || obj.type === "MultiPolygon") && Array.isArray((obj as { coordinates?: unknown }).coordinates)) {
    return {
      ok: true,
      geo: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: parsed }],
      },
    };
  }
  return { ok: false, error: "Expected a FeatureCollection, Feature, Polygon, or MultiPolygon." };
}

export async function createMapVersion(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const locationId = String(formData.get("location_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) return { ok: false, message: "Invalid location." };
  const raw = String(formData.get("geojson") ?? "");
  const parsed = parseGeoJson(raw);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const loc = await one<{ id: string }>("SELECT id FROM locations WHERE id = $1", [locationId]);
  if (!loc) return { ok: false, message: "Location not found." };

  const existing = await one<{ max: number | null }>(
    "SELECT max(version) AS max FROM map_assets WHERE location_id = $1",
    [locationId],
  );
  const nextVersion = (existing?.max ?? 0) + 1;

  const row = await one<{ id: string }>(
    `INSERT INTO map_assets (location_id, version, status, geojson)
     VALUES ($1, $2, 'draft', $3::jsonb) RETURNING id`,
    [locationId, nextVersion, JSON.stringify(parsed.geo)],
  );
  await audit(user.id, "map.create", { type: "map_asset", id: row!.id }, { new: { location_id: locationId, version: nextVersion } });
  revalidatePath("/maps");
  revalidatePath(`/maps/${locationId}`);
  return { ok: true };
}

export async function approveMapVersion(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ id: string; location_id: string; version: number }>(
    "SELECT id, location_id, version FROM map_assets WHERE id = $1",
    [id],
  );
  if (!row) return;
  // Retire any currently approved map for this location.
  await query(
    "UPDATE map_assets SET status = 'retired' WHERE location_id = $1 AND status = 'approved' AND id <> $2",
    [row.location_id, id],
  );
  await query(
    "UPDATE map_assets SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1",
    [id, user.id],
  );
  await query(
    "UPDATE locations SET map_status = 'approved', updated_at = now() WHERE id = $1",
    [row.location_id],
  );
  await audit(user.id, "map.approve", { type: "map_asset", id }, { new: { version: row.version } });
  revalidatePath("/maps");
  revalidatePath(`/maps/${row.location_id}`);
}

export async function retireMapVersion(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ id: string; location_id: string; status: string }>(
    "SELECT id, location_id, status FROM map_assets WHERE id = $1",
    [id],
  );
  if (!row) return;
  await query("UPDATE map_assets SET status = 'retired' WHERE id = $1", [id]);
  // If no approved version remains, flag the location as draft (not deleted).
  const stillApproved = await one(
    "SELECT 1 FROM map_assets WHERE location_id = $1 AND status = 'approved'",
    [row.location_id],
  );
  if (!stillApproved) {
    await query(
      "UPDATE locations SET map_status = 'draft', updated_at = now() WHERE id = $1 AND map_status = 'approved'",
      [row.location_id],
    );
  }
  await audit(user.id, "map.retire", { type: "map_asset", id });
  revalidatePath("/maps");
  revalidatePath(`/maps/${row.location_id}`);
}

export async function deleteMapVersion(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ id: string; location_id: string; status: string }>(
    "SELECT id, location_id, status FROM map_assets WHERE id = $1",
    [id],
  );
  if (!row) return;
  if (row.status === "approved") {
    // Approving a different version is required before deletion; refuse quietly.
    return;
  }
  await query("DELETE FROM map_assets WHERE id = $1", [id]);
  await audit(user.id, "map.delete", { type: "map_asset", id });
  revalidatePath("/maps");
  revalidatePath(`/maps/${row.location_id}`);
}

// ---------------------------------------------------------------- maps bulk seed
// Phase 14: one-click bulk seeding + bulk approve.
//
// seedMapsBatch picks the next `limit` locations with no map yet and tries to
// pull a polygon from OpenStreetMap (via lib/maps/sources). Each successful
// hit becomes a draft map_asset. We paginate from the client so a long run
// (100 appellations × 1s/each) stays well below Vercel's function timeout.
export type SeedBatchResult = {
  processed: number;
  attempted: Array<{
    location_id: string;
    name: string;
    status: "seeded" | "already_had_version" | "no_match" | "error";
    message?: string;
    source_url?: string;
  }>;
  remaining: number;
};

export async function seedMapsBatch(formData: FormData): Promise<SeedBatchResult> {
  const user = await requireEditor();
  const limit = Math.min(10, Math.max(1, parseInt(String(formData.get("limit") ?? "5"), 10) || 5));
  const scope = String(formData.get("scope") ?? "needs_map"); // "needs_map" | "all_missing"

  // We only touch locations that have NO map versions at all (status counts).
  // "needs_map" scope narrows that to locations tagged needs_map so the admin
  // can retry drafts separately without wiping them.
  const statusFilter = scope === "all_missing"
    ? "AND l.map_status <> 'approved'"
    : "AND l.map_status = 'needs_map'";
  const batch = await query<{
    id: string; name: string; type: "country" | "region" | "subregion" | "appellation";
    parent_id: string | null;
  }>(
    `SELECT l.id, l.name, l.type, l.parent_id
     FROM locations l
     WHERE NOT EXISTS (SELECT 1 FROM map_assets m WHERE m.location_id = l.id)
       ${statusFilter}
     ORDER BY
       CASE l.type WHEN 'appellation' THEN 0 WHEN 'subregion' THEN 1 WHEN 'region' THEN 2 ELSE 3 END,
       l.name
     LIMIT $1`,
    [limit],
  );
  const total = await one<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM locations l
     WHERE NOT EXISTS (SELECT 1 FROM map_assets m WHERE m.location_id = l.id)
       ${statusFilter}`,
  );

  const { fetchFromNominatim, composeQuery, sleep } = await import("./maps/sources");

  const attempted: SeedBatchResult["attempted"] = [];
  let processed = 0;
  for (const loc of batch) {
    // Climb to find country + region for a better Nominatim query.
    const chain = await query<{ type: string; name: string }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
         UNION ALL SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1
           FROM locations x JOIN up ON x.id = up.parent_id)
       SELECT type, name FROM up`,
      [loc.id],
    );
    const countryName = chain.find((c) => c.type === "country")?.name ?? null;
    const regionName = chain.find((c) => c.type === "region" && c.name !== loc.name)?.name ?? null;
    const q = composeQuery({ name: loc.name, type: loc.type, countryName, regionName });

    const r = await fetchFromNominatim({ query: q, type: loc.type, countryHint: countryName ?? undefined });
    if (!r.ok) {
      attempted.push({ location_id: loc.id, name: loc.name, status: "no_match", message: r.reason });
    } else {
      try {
        const existing = await one<{ max: number | null }>(
          "SELECT max(version) AS max FROM map_assets WHERE location_id = $1",
          [loc.id],
        );
        const nextVersion = (existing?.max ?? 0) + 1;
        const row = await one<{ id: string }>(
          `INSERT INTO map_assets (location_id, version, status, geojson, settings)
           VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb) RETURNING id`,
          [
            loc.id,
            nextVersion,
            JSON.stringify(r.collection),
            JSON.stringify({ seeded_from: r.source, source_url: r.source_url, display_name: r.display_name }),
          ],
        );
        await query(
          "UPDATE locations SET map_status = 'draft', updated_at = now() WHERE id = $1 AND map_status = 'needs_map'",
          [loc.id],
        );
        await audit(user.id, "map.seed_osm", { type: "map_asset", id: row!.id }, undefined, {
          location_id: loc.id, osm_url: r.source_url,
        });
        attempted.push({
          location_id: loc.id, name: loc.name, status: "seeded", source_url: r.source_url,
        });
      } catch (err) {
        attempted.push({
          location_id: loc.id, name: loc.name, status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    processed++;
    // Nominatim rate limit: 1 request/second.
    if (processed < batch.length) await sleep(1100);
  }
  revalidatePath("/maps");
  revalidatePath("/maps/seed");
  return {
    processed,
    attempted,
    remaining: Math.max(0, (total?.n ?? 0) - processed),
  };
}

// Bulk-approve every draft version — picks the latest draft per location.
export async function approveAllDraftMaps(): Promise<{ approved: number }> {
  const user = await requireAdmin();
  // Pick the newest draft per location.
  const rows = await query<{ id: string; location_id: string; version: number }>(
    `SELECT DISTINCT ON (location_id) id, location_id, version
     FROM map_assets WHERE status = 'draft'
     ORDER BY location_id, version DESC`,
  );
  let approved = 0;
  for (const row of rows) {
    await query(
      "UPDATE map_assets SET status = 'retired' WHERE location_id = $1 AND status = 'approved' AND id <> $2",
      [row.location_id, row.id],
    );
    await query(
      "UPDATE map_assets SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1",
      [row.id, user.id],
    );
    await query(
      "UPDATE locations SET map_status = 'approved', updated_at = now() WHERE id = $1",
      [row.location_id],
    );
    await audit(user.id, "map.bulk_approve", { type: "map_asset", id: row.id }, { new: { version: row.version } });
    approved++;
  }
  revalidatePath("/maps");
  revalidatePath("/maps/seed");
  return { approved };
}

// Snapshot used by /maps/seed to render stats + the per-location next-up queue.
export async function mapsSeedSnapshot() {
  await requireEditor();
  const [stats, pending] = await Promise.all([
    one<{
      total: number; approved: number; draft: number; needs_map: number;
      no_version: number; wine_count_with_map: number; wine_count_no_map: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM locations) AS total,
         (SELECT count(*)::int FROM locations WHERE map_status = 'approved') AS approved,
         (SELECT count(*)::int FROM locations WHERE map_status = 'draft') AS draft,
         (SELECT count(*)::int FROM locations WHERE map_status = 'needs_map') AS needs_map,
         (SELECT count(*)::int FROM locations l
            WHERE NOT EXISTS (SELECT 1 FROM map_assets m WHERE m.location_id = l.id)) AS no_version,
         (SELECT count(*)::int FROM wine_vintages v JOIN locations l ON l.id = v.location_id
            WHERE v.deleted_at IS NULL AND l.map_status = 'approved') AS wine_count_with_map,
         (SELECT count(*)::int FROM wine_vintages v JOIN locations l ON l.id = v.location_id
            WHERE v.deleted_at IS NULL AND l.map_status <> 'approved') AS wine_count_no_map`,
    ),
    query<{ id: string; name: string; type: string; wine_count: number }>(
      `SELECT l.id, l.name, l.type,
         (SELECT count(*)::int FROM wine_vintages v
            WHERE v.location_id = l.id AND v.deleted_at IS NULL) AS wine_count
       FROM locations l
       WHERE NOT EXISTS (SELECT 1 FROM map_assets m WHERE m.location_id = l.id)
       ORDER BY
         CASE l.type WHEN 'appellation' THEN 0 WHEN 'subregion' THEN 1 WHEN 'region' THEN 2 ELSE 3 END,
         l.name
       LIMIT 60`,
    ),
  ]);
  return { stats: stats ?? null, pending };
}

// ---------------------------------------------------------------- producers
type ProducerRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  website: string | null;
  winery_summary_short: string | null;
  winery_story_long: string | null;
  default_supervision_display: string | null;
  country_location_id: string | null;
  primary_location_id: string | null;
  active: boolean;
};

export async function updateProducer(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const before = await one<ProducerRow>(
    `SELECT id, name, short_name, slug, website, winery_summary_short, winery_story_long,
            default_supervision_display, country_location_id, primary_location_id, active
       FROM producers WHERE id = $1`,
    [id],
  );
  if (!before) return;

  const name = (s(formData, "name") ?? before.name).slice(0, 240);
  const next = {
    name,
    short_name: s(formData, "short_name"),
    website: s(formData, "website"),
    winery_summary_short: s(formData, "winery_summary_short"),
    winery_story_long: s(formData, "winery_story_long"),
    default_supervision_display: s(formData, "default_supervision_display"),
    country_location_id: /^[0-9a-f-]{36}$/i.test(String(formData.get("country_location_id") ?? ""))
      ? String(formData.get("country_location_id"))
      : null,
    primary_location_id: /^[0-9a-f-]{36}$/i.test(String(formData.get("primary_location_id") ?? ""))
      ? String(formData.get("primary_location_id"))
      : null,
    active: formData.get("active") !== "false",
  };

  await query(
    `UPDATE producers SET
       name = $2, short_name = $3, website = $4,
       winery_summary_short = $5, winery_story_long = $6,
       default_supervision_display = $7,
       country_location_id = $8, primary_location_id = $9,
       active = $10, updated_at = now()
     WHERE id = $1`,
    [id, next.name, next.short_name, next.website,
     next.winery_summary_short, next.winery_story_long,
     next.default_supervision_display,
     next.country_location_id, next.primary_location_id, next.active],
  );
  await audit(user.id, "producer.update", { type: "producer", id }, {
    old: {
      name: before.name, short_name: before.short_name, website: before.website,
      winery_summary_short: before.winery_summary_short, winery_story_long: before.winery_story_long,
      default_supervision_display: before.default_supervision_display,
      country_location_id: before.country_location_id, primary_location_id: before.primary_location_id,
      active: before.active,
    },
    new: next,
  });
  revalidatePath(`/producers/${id}`);
  revalidatePath("/producers");
}

// ---------------------------------------------------------------- provenance
// Verify / reject / mark-current actions for field_provenance rows.
// Verify: the editor has checked the raw value against the cited source.
// Reject: the raw value is wrong (does not match the source or the field).
// Resolve conflict: pick the authoritative row for a (entity, field) pair —
//   the chosen row becomes is_current=true and verified; the others go to
//   is_current=false. The entity table's own value is NOT changed from here;
//   use the Replace button to also push the raw value into the field.
export async function verifyProvenance(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ entity_type: string; entity_id: string; field_name: string }>(
    "SELECT entity_type, entity_id, field_name FROM field_provenance WHERE id = $1",
    [id],
  );
  if (!row) return;
  await query(
    `UPDATE field_provenance SET verification_status = 'verified', verified_at = now(), verified_by = $2
       WHERE id = $1`,
    [id, user.id],
  );
  await audit(user.id, "provenance.verify", { type: "field_provenance", id, field: row.field_name });
  revalidatePath(`/wines/${row.entity_id}`);
  revalidatePath(`/producers/${row.entity_id}`);
}

export async function rejectProvenance(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ entity_type: string; entity_id: string; field_name: string }>(
    "SELECT entity_type, entity_id, field_name FROM field_provenance WHERE id = $1",
    [id],
  );
  if (!row) return;
  await query(
    `UPDATE field_provenance SET verification_status = 'rejected', is_current = false,
         verified_at = now(), verified_by = $2
       WHERE id = $1`,
    [id, user.id],
  );
  await audit(user.id, "provenance.reject", { type: "field_provenance", id, field: row.field_name });
  revalidatePath(`/wines/${row.entity_id}`);
  revalidatePath(`/producers/${row.entity_id}`);
}

export async function resolveProvenanceConflict(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ entity_type: string; entity_id: string; field_name: string }>(
    "SELECT entity_type, entity_id, field_name FROM field_provenance WHERE id = $1",
    [id],
  );
  if (!row) return;
  // Mark every other provenance row for the same (entity, field) non-current.
  await query(
    `UPDATE field_provenance SET is_current = false
       WHERE entity_type = $1 AND entity_id = $2 AND field_name = $3 AND id <> $4`,
    [row.entity_type, row.entity_id, row.field_name, id],
  );
  // The chosen row becomes current + verified.
  await query(
    `UPDATE field_provenance SET is_current = true, verification_status = 'verified',
         verified_at = now(), verified_by = $2
       WHERE id = $1`,
    [id, user.id],
  );
  // Any open 'conflict' review flag for this entity+field gets resolved too.
  await query(
    `UPDATE review_flags SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE entity_type = $2 AND entity_id = $3 AND field_name = $4
         AND flag_type = 'conflict' AND status = 'open'`,
    [user.id, row.entity_type, row.entity_id, row.field_name],
  );
  await audit(user.id, "provenance.resolve_conflict",
    { type: "field_provenance", id, field: row.field_name });
  revalidatePath(`/wines/${row.entity_id}`);
  revalidatePath(`/producers/${row.entity_id}`);
}

// Push a provenance row's raw_value into the entity's own column.  Only a
// small, hand-curated allow-list of fields is wired up — pushing a value into
// a numeric or JSON column would corrupt it.
const PUSHABLE_WINE_VINTAGE_FIELDS = new Set([
  "tasting_note", "food_pairing", "aging_display", "supervision_display",
  "special_designation", "short_description", "wine_story", "vintage_text",
]);
const PUSHABLE_PRODUCER_FIELDS = new Set([
  "name", "short_name", "website", "winery_summary_short", "winery_story_long",
  "default_supervision_display",
]);

export async function pushProvenanceValue(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Bad id." };
  const row = await one<{ entity_type: string; entity_id: string; field_name: string; raw_value: string | null }>(
    "SELECT entity_type, entity_id, field_name, raw_value FROM field_provenance WHERE id = $1",
    [id],
  );
  if (!row) return { ok: false, message: "Provenance row not found." };
  const value = row.raw_value;
  if (value === null) return { ok: false, message: "This source row has no raw value to push." };

  if (row.entity_type === "wine_vintage" && PUSHABLE_WINE_VINTAGE_FIELDS.has(row.field_name)) {
    await query(
      `UPDATE wine_vintages SET ${row.field_name} = $2, updated_at = now() WHERE id = $1`,
      [row.entity_id, value],
    );
  } else if (row.entity_type === "producer" && PUSHABLE_PRODUCER_FIELDS.has(row.field_name)) {
    await query(
      `UPDATE producers SET ${row.field_name} = $2, updated_at = now() WHERE id = $1`,
      [row.entity_id, value],
    );
  } else {
    return { ok: false, message: `Field "${row.field_name}" cannot be auto-replaced from here. Edit it manually.` };
  }
  // Mark the source row verified + current.
  await query(
    `UPDATE field_provenance SET is_current = true, verification_status = 'verified',
         verified_at = now(), verified_by = $2
       WHERE id = $1`,
    [id, user.id],
  );
  await audit(user.id, "provenance.push",
    { type: row.entity_type, id: row.entity_id, field: row.field_name },
    { new: value });
  revalidatePath(`/wines/${row.entity_id}`);
  revalidatePath(`/producers/${row.entity_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- catalog shares
function newShareToken(): string {
  // url-safe base64 of 24 random bytes (32 chars). Collision risk is zero.
  return crypto.randomBytes(24).toString("base64url");
}

export async function createCatalogShare(formData: FormData): Promise<{ ok: boolean; token?: string; message?: string }> {
  const user = await requireEditor();
  const catalogId = String(formData.get("catalog_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) return { ok: false, message: "Bad catalog id." };
  const label = s(formData, "label");
  const recipientName = s(formData, "recipient_name");
  const recipientEmail = (s(formData, "recipient_email") ?? "").toLowerCase().trim() || null;
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, message: "Invalid recipient email." };
  }
  const password = (s(formData, "password") ?? "").trim();
  const expiresRaw = s(formData, "expires_at");
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { ok: false, message: "Invalid expiry date." };
  }

  const exists = await one("SELECT id FROM catalogs WHERE id = $1", [catalogId]);
  if (!exists) return { ok: false, message: "Catalog not found." };

  // Hash the password if one was supplied — see lib/sharePassword.ts for format.
  let passwordHash: string | null = null;
  if (password) {
    if (password.length < 4) return { ok: false, message: "Password must be at least 4 characters." };
    const { hashSharePassword } = await import("./sharePassword");
    passwordHash = hashSharePassword(password);
  }

  const token = newShareToken();
  await query(
    `INSERT INTO catalog_shares
       (catalog_id, token, label, created_by, expires_at,
        recipient_name, recipient_email, password_hash, password_set_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 IS NULL THEN NULL ELSE now() END)`,
    [catalogId, token, label, user.id, expiresAt, recipientName, recipientEmail, passwordHash],
  );
  await audit(user.id, "catalog_share.create", { type: "catalog", id: catalogId },
    { new: {
        token: token.slice(0, 6) + "…",
        label,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        has_password: Boolean(passwordHash),
        expires_at: expiresAt?.toISOString() ?? null,
    } });
  revalidatePath(`/catalogs/${catalogId}`);
  return { ok: true, token };
}

// Clone a catalog's composition (sections + items) under a new name. Export
// history, shares and settings do NOT carry over — a copy is a fresh slate
// the editor can rework without touching the original's run of exports.
export async function cloneCatalog(formData: FormData): Promise<{ ok: boolean; id?: string; message?: string }> {
  const user = await requireEditor();
  const sourceId = String(formData.get("catalog_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return { ok: false, message: "Bad catalog id." };
  const nameOverride = (s(formData, "name") ?? "").trim();

  const source = await one<{ id: string; name: string; season: string | null; render_mode: string; cover_theme: string | null; settings: Record<string, unknown> }>(
    "SELECT id, name, season, render_mode, cover_theme, settings FROM catalogs WHERE id = $1",
    [sourceId],
  );
  if (!source) return { ok: false, message: "Catalog not found." };

  const newName = nameOverride || `${source.name} (copy)`;
  const created = await one<{ id: string }>(
    `INSERT INTO catalogs (name, season, render_mode, cover_theme, settings, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [newName, source.season, source.render_mode, source.cover_theme, source.settings ?? {}, user.id],
  );
  const newId = created!.id;

  // Walk sections → build an id map so items land under the right new sections.
  const sections = await query<{ id: string; kind: string; title: string | null; position: number; settings: Record<string, unknown> }>(
    "SELECT id, kind, title, position, settings FROM catalog_sections WHERE catalog_id = $1 ORDER BY position",
    [sourceId],
  );
  const idMap = new Map<string, string>();
  for (const sec of sections) {
    const r = await one<{ id: string }>(
      `INSERT INTO catalog_sections (catalog_id, kind, title, position, settings)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [newId, sec.kind, sec.title, sec.position, sec.settings ?? {}],
    );
    idMap.set(sec.id, r!.id);
  }
  const items = await query<{ section_id: string | null; wine_vintage_id: string; position: number; render_mode_override: string | null; settings: Record<string, unknown> }>(
    "SELECT section_id, wine_vintage_id, position, render_mode_override, settings FROM catalog_items WHERE catalog_id = $1 ORDER BY position",
    [sourceId],
  );
  for (const it of items) {
    await query(
      `INSERT INTO catalog_items (catalog_id, section_id, wine_vintage_id, position, render_mode_override, settings)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId, it.section_id ? idMap.get(it.section_id) ?? null : null, it.wine_vintage_id, it.position, it.render_mode_override, it.settings ?? {}],
    );
  }

  await audit(user.id, "catalog.clone", { type: "catalog", id: newId }, undefined, {
    source_id: sourceId, sections: sections.length, items: items.length,
  });
  revalidatePath("/catalogs");
  revalidatePath(`/catalogs/${newId}`);
  return { ok: true, id: newId };
}

export async function revokeCatalogShare(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ catalog_id: string }>(
    "SELECT catalog_id FROM catalog_shares WHERE id = $1",
    [id],
  );
  if (!row) return;
  await query("UPDATE catalog_shares SET revoked_at = now() WHERE id = $1", [id]);
  await audit(user.id, "catalog_share.revoke", { type: "catalog_share", id });
  revalidatePath(`/catalogs/${row.catalog_id}`);
}

// ---------------------------------------------------------------- theme tokens
const SCOPE_TYPES = ["global", "category", "region"] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];

export async function upsertThemeTokens(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const scopeType = String(formData.get("scope_type") ?? "") as ScopeType;
  if (!(SCOPE_TYPES as readonly string[]).includes(scopeType)) {
    return { ok: false, message: "Pick a scope." };
  }
  const scopeKey = (s(formData, "scope_key") ?? "").slice(0, 120);
  if (!scopeKey) return { ok: false, message: "Scope key is required (e.g. 'red', 'france', or 'default')." };

  let tokens: Record<string, string> = {};
  const tokensRaw = s(formData, "tokens") ?? "";
  if (tokensRaw) {
    try {
      const parsed = JSON.parse(tokensRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        tokens = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k.slice(0, 80), String(v).slice(0, 240)]),
        );
      } else {
        return { ok: false, message: "Expected a JSON object of key:value strings." };
      }
    } catch {
      return { ok: false, message: "Not valid JSON." };
    }
  }

  await query(
    `INSERT INTO theme_tokens (scope_type, scope_key, tokens, updated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (scope_type, scope_key)
       DO UPDATE SET tokens = EXCLUDED.tokens, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [scopeType, scopeKey, JSON.stringify(tokens), user.id],
  );
  await audit(user.id, "theme.upsert", { type: "theme_token", id: `${scopeType}/${scopeKey}` }, { new: tokens });
  revalidatePath("/theme");
  return { ok: true };
}

export async function deleteThemeTokens(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ scope_type: string; scope_key: string }>(
    "SELECT scope_type, scope_key FROM theme_tokens WHERE id = $1", [id],
  );
  if (!row) return;
  await query("DELETE FROM theme_tokens WHERE id = $1", [id]);
  await audit(user.id, "theme.delete", { type: "theme_token", id: `${row.scope_type}/${row.scope_key}` });
  revalidatePath("/theme");
}

// ---------------------------------------------------------------- QC
export async function runQcScanAction(): Promise<{
  ok: boolean;
  counts?: Record<string, number>;
  total?: number;
}> {
  const user = await requireEditor();
  const { runQcScan } = await import("./qc/scan");
  const counts = await runQcScan();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  await audit(user.id, "qc.scan", { type: "system", id: "qc" }, { new: counts });
  revalidatePath("/review");
  revalidatePath("/");
  return { ok: true, counts, total };
}

// ---------------------------------------------------------------- sources
const SOURCE_TYPES = [
  "mm_catalog", "mm_website", "tech_sheet", "producer_website",
  "appellation_authority", "critic_review", "import_document",
  "winery_correspondence", "other",
] as const;

export async function attachSource(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const entityType = String(formData.get("entity_type") ?? "");
  const entityId = String(formData.get("entity_id") ?? "");
  const fieldName = s(formData, "field_name");
  const sourceType = String(formData.get("source_type") ?? "");
  const title = s(formData, "title");
  const url = s(formData, "url");
  const rawValue = s(formData, "raw_value");
  const notes = s(formData, "notes");

  if (!["wine_vintage", "producer"].includes(entityType)) {
    return { ok: false, message: "Unknown entity type." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) return { ok: false, message: "Bad id." };
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return { ok: false, message: "Choose a source type." };
  }
  if (!title) return { ok: false, message: "Give the source a title." };
  if (!fieldName) return { ok: false, message: "Specify which field this source backs." };

  const srcRow = await one<{ id: string }>(
    `INSERT INTO sources (source_type, title, url, added_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
    [sourceType, title, url, user.id],
  );
  await one<{ id: string }>(
    `INSERT INTO field_provenance
       (entity_type, entity_id, field_name, raw_value, source_id, verification_status, is_current, notes)
     VALUES ($1, $2, $3, $4, $5, 'unverified', true, $6) RETURNING id`,
    [entityType, entityId, fieldName, rawValue, srcRow!.id, notes],
  );
  await audit(user.id, "source.attach",
    { type: entityType, id: entityId, field: fieldName },
    { new: { source_type: sourceType, title, url } });
  revalidatePath(`/wines/${entityId}`);
  revalidatePath(`/producers/${entityId}`);
  return { ok: true };
}



// ---------------------------------------------------------------- saved views
// A per-user "view" is a named snapshot of a list page's URL (path + query).
// Users pin a few as tabs above the list; clicking opens the exact filter set.
const SAVED_SCOPES = new Set(["wines", "catalogs", "assets", "producers", "maps", "review"]);

export async function createSavedView(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const scope = String(formData.get("scope") ?? "");
  if (!SAVED_SCOPES.has(scope)) return { ok: false, message: "Unknown scope." };
  const name = (s(formData, "name") ?? "").slice(0, 120);
  const path = (s(formData, "path") ?? "").slice(0, 240);
  const q = (s(formData, "query") ?? "").slice(0, 2048);
  if (!name) return { ok: false, message: "Give the view a name." };
  if (!path || !path.startsWith("/")) return { ok: false, message: "Missing path." };
  await query(
    `INSERT INTO saved_views (user_id, scope, name, path, query, pinned)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [user.id, scope, name, path, q],
  );
  await audit(user.id, "saved_view.create", { type: "saved_view", id: scope }, { new: { name, path, query: q } });
  revalidatePath(path);
  return { ok: true };
}

export async function toggleSavedViewPin(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ scope: string; pinned: boolean; path: string }>(
    "SELECT scope, pinned, path FROM saved_views WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  if (!row) return;
  await query(
    "UPDATE saved_views SET pinned = NOT pinned, updated_at = now() WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  await audit(user.id, "saved_view.pin", { type: "saved_view", id }, { new: { pinned: !row.pinned } });
  revalidatePath(row.path);
}

export async function deleteSavedView(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ path: string }>("SELECT path FROM saved_views WHERE id = $1 AND user_id = $2", [id, user.id]);
  await query("DELETE FROM saved_views WHERE id = $1 AND user_id = $2", [id, user.id]);
  await audit(user.id, "saved_view.delete", { type: "saved_view", id });
  if (row) revalidatePath(row.path);
}

// ---------------------------------------------------------------- dropbox import
// Pull one or more files from Dropbox into the asset library. Each file is
// downloaded, SHA-256-deduped against existing assets, and either reused or
// uploaded fresh to Firebase Storage.  Returns per-file outcome so the UI
// can show "3 imported, 2 already in library, 1 failed".
const ASSET_KIND_FROM_DROPBOX = new Set(["bottle", "map", "logo", "photo", "document", "pdf", "other"]);

export type DropboxImportResult = {
  path: string;
  status: "imported" | "deduped" | "failed";
  asset_id?: string;
  message?: string;
};

export async function importFromDropbox(formData: FormData): Promise<{ ok: boolean; results: DropboxImportResult[]; message?: string }> {
  const user = await requireEditor();
  const kindRaw = String(formData.get("kind") ?? "photo");
  const kind = ASSET_KIND_FROM_DROPBOX.has(kindRaw) ? kindRaw : "photo";
  const pathsRaw = String(formData.get("paths") ?? "");
  const paths = pathsRaw.split("\n").map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) return { ok: false, results: [], message: "No files selected." };

  const { downloadFile, guessImageContentType } = await import("./dropbox");
  const { uploadBytes, storageConfigured } = await import("./storage");
  if (!storageConfigured()) {
    return { ok: false, results: [], message: "Image storage is not configured." };
  }

  const results: DropboxImportResult[] = [];
  for (const path of paths) {
    try {
      const { bytes, name, contentType: ct } = await downloadFile(path);
      const contentType = ct === "application/octet-stream" ? guessImageContentType(name) : ct;
      const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

      const existing = await one<{ id: string }>(
        "SELECT id FROM assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL",
        [checksum],
      );
      if (existing) {
        results.push({ path, status: "deduped", asset_id: existing.id });
        continue;
      }

      const id = crypto.randomUUID();
      const ext = contentType === "image/jpeg" ? "jpg"
        : contentType === "image/png" ? "png"
        : contentType === "image/webp" ? "webp"
        : contentType === "image/avif" ? "avif"
        : contentType === "application/pdf" ? "pdf"
        : contentType === "image/svg+xml" ? "svg"
        : "bin";
      const storagePath = `assets/originals/${id}.${ext}`;
      await uploadBytes({
        storagePath,
        bytes,
        contentType,
        metadata: {
          uploadedBy: user.id,
          source: "dropbox",
          originalPath: path.slice(0, 240),
        },
      });

      const row = await one<{ id: string }>(
        `INSERT INTO assets (
           id, kind, derivative, storage_path, file_name, mime_type,
           bytes, checksum_sha256, uploaded_by, metadata)
         VALUES ($1, $2, 'original', $3, $4, $5, $6, $7, $8,
                 jsonb_build_object('source', 'dropbox', 'dropbox_path', $9::text))
         RETURNING id`,
        [id, kind, storagePath, name.slice(0, 240), contentType, bytes.byteLength, checksum, user.id, path],
      );
      await audit(user.id, "asset.dropbox_import",
        { type: "asset", id: row!.id },
        { new: { source: "dropbox", path, bytes: bytes.byteLength } });
      results.push({ path, status: "imported", asset_id: row!.id });
    } catch (err) {
      results.push({ path, status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }
  revalidatePath("/assets");
  revalidatePath("/dropbox");
  return { ok: true, results };
}

// ---------------------------------------------------------------- CSV import wines
import type { ImportSummary, ImportRowOutcome } from "./csvImport";

function parseMevushal(v: string | undefined): "yes" | "no" | "unknown" {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "yes" || t === "y" || t === "true" || t === "1") return "yes";
  if (t === "no"  || t === "n" || t === "false" || t === "0") return "no";
  return "unknown";
}

function parseSizes(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

async function findOrCreateProducer(name: string, userId: string): Promise<string | null> {
  const t = name.trim();
  if (!t) return null;
  const existing = await one<{ id: string }>(
    "SELECT id FROM producers WHERE lower(name) = lower($1) AND deleted_at IS NULL",
    [t],
  );
  if (existing) return existing.id;
  const base = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  let slug = base; let n = 2;
  while (await one("SELECT 1 FROM producers WHERE slug = $1", [slug])) {
    slug = `${base}-${n++}`;
  }
  const row = await one<{ id: string }>(
    "INSERT INTO producers (name, slug) VALUES ($1, $2) RETURNING id",
    [t, slug],
  );
  await audit(userId, "producer.import_create", { type: "producer", id: row!.id }, { new: { name: t, source: "csv" } });
  return row!.id;
}

async function findOrCreateWine(producerId: string, displayName: string, category: string | null, userId: string): Promise<string | null> {
  const existing = await one<{ id: string }>(
    "SELECT id FROM wines WHERE producer_id = $1 AND lower(display_name) = lower($2) AND deleted_at IS NULL",
    [producerId, displayName],
  );
  if (existing) return existing.id;
  const base = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  let slug = base; let n = 2;
  while (await one("SELECT 1 FROM wines WHERE slug = $1", [slug])) {
    slug = `${base}-${n++}`;
  }
  const row = await one<{ id: string }>(
    `INSERT INTO wines (producer_id, canonical_name, display_name, slug, category)
     VALUES ($1, $2, $2, $3, $4) RETURNING id`,
    [producerId, displayName, slug, category],
  );
  await audit(userId, "wine.import_create", { type: "wine", id: row!.id }, { new: { producer_id: producerId, display_name: displayName, source: "csv" } });
  return row!.id;
}

export async function runWineCsvImport(formData: FormData): Promise<{ ok: boolean; summary?: ImportSummary; message?: string }> {
  const user = await requireEditor();
  const csvText = String(formData.get("csv") ?? "");
  const dryRun = formData.get("dry_run") === "1";
  if (!csvText.trim()) return { ok: false, message: "CSV is empty." };

  const { parseCsv, resolveHeaders } = await import("./csvImport");
  const parsed = parseCsv(csvText);
  if (parsed.rows.length === 0) return { ok: false, message: "No rows in CSV." };
  const headers = resolveHeaders(parsed.headers);
  if (!headers.producer || !headers.wine) {
    return { ok: false, message: `Need Producer and Wine columns (got ${parsed.headers.join(", ")}).` };
  }

  const outcomes: ImportRowOutcome[] = [];
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, failed: 0, outcomes };

  for (let i = 0; i < parsed.rows.length; i++) {
    const line = i + 2; // header is line 1
    const r = parsed.rows[i];
    try {
      const producerName = headers.producer ? r[headers.producer] : "";
      const wineName = headers.wine ? r[headers.wine] : "";
      if (!producerName || !wineName) {
        outcomes.push({ line, status: "skipped", reason: "Missing producer or wine name" });
        summary.skipped++;
        continue;
      }
      const vintageText = headers.vintage ? r[headers.vintage]?.trim() || null : null;
      const category = headers.category ? r[headers.category]?.trim().toLowerCase() || null : null;
      const mevushal = headers.mevushal ? parseMevushal(r[headers.mevushal]) : "unknown";
      const supervision = headers.supervision ? r[headers.supervision]?.trim() || null : null;
      const aging = headers.aging ? r[headers.aging]?.trim() || null : null;
      const sizes = headers.sizes ? parseSizes(r[headers.sizes]) : [];
      const status = headers.status ? r[headers.status]?.trim() || null : null;
      const tastingNote = headers.tasting_note ? r[headers.tasting_note]?.trim() || null : null;
      const foodPairing = headers.food_pairing ? r[headers.food_pairing]?.trim() || null : null;
      const shortDesc = headers.short_description ? r[headers.short_description]?.trim() || null : null;

      if (dryRun) {
        const existingProd = await one<{ id: string }>("SELECT id FROM producers WHERE lower(name) = lower($1) AND deleted_at IS NULL", [producerName]);
        const existingWine = existingProd
          ? await one<{ id: string }>("SELECT id FROM wines WHERE producer_id = $1 AND lower(display_name) = lower($2) AND deleted_at IS NULL", [existingProd.id, wineName])
          : null;
        const existingVintage = existingWine
          ? await one<{ id: string }>(
              "SELECT id FROM wine_vintages WHERE wine_id = $1 AND coalesce(vintage_text,'') = coalesce($2,'') AND deleted_at IS NULL",
              [existingWine.id, vintageText],
            )
          : null;
        if (existingVintage) {
          outcomes.push({ line, status: "updated", wine_id: existingWine!.id, vintage_id: existingVintage.id, changed: [] });
          summary.updated++;
        } else {
          outcomes.push({ line, status: "created", wine_id: existingWine?.id ?? "new", vintage_id: "new" });
          summary.created++;
        }
        continue;
      }

      const producerId = await findOrCreateProducer(producerName, user.id);
      if (!producerId) throw new Error("Could not resolve producer");
      const wineId = await findOrCreateWine(producerId, wineName, category, user.id);
      if (!wineId) throw new Error("Could not resolve wine");

      const existingVintage = await one<{
        id: string; mevushal: string; supervision_display: string | null; aging_display: string | null;
        bottle_sizes: string[]; status: string;
        tasting_note: string | null; food_pairing: string | null; short_description: string | null;
      }>(
        "SELECT id, mevushal, supervision_display, aging_display, bottle_sizes, status, tasting_note, food_pairing, short_description FROM wine_vintages WHERE wine_id = $1 AND coalesce(vintage_text,'') = coalesce($2,'') AND deleted_at IS NULL",
        [wineId, vintageText],
      );

      const nextStatus = status && ["draft", "needs_review", "approved", "published", "discontinued"].includes(status)
        ? status : (existingVintage?.status ?? "draft");

      if (existingVintage) {
        const changed: string[] = [];
        const patch: Record<string, unknown> = {};
        function set<K extends string>(field: K, next: unknown, prev: unknown) {
          if (next !== null && next !== undefined && JSON.stringify(next) !== JSON.stringify(prev)) {
            patch[field] = next;
            changed.push(field);
          }
        }
        if (headers.mevushal) set("mevushal", mevushal, existingVintage.mevushal);
        if (headers.supervision) set("supervision_display", supervision, existingVintage.supervision_display);
        if (headers.aging) set("aging_display", aging, existingVintage.aging_display);
        if (headers.sizes && sizes.length) set("bottle_sizes", sizes, existingVintage.bottle_sizes);
        if (headers.status) set("status", nextStatus, existingVintage.status);
        if (headers.tasting_note) set("tasting_note", tastingNote, existingVintage.tasting_note);
        if (headers.food_pairing) set("food_pairing", foodPairing, existingVintage.food_pairing);
        if (headers.short_description) set("short_description", shortDesc, existingVintage.short_description);

        if (changed.length === 0) {
          outcomes.push({ line, status: "skipped", reason: "No changes vs existing row" });
          summary.skipped++;
          continue;
        }
        const sets = changed.map((f, idx) => `${f} = $${idx + 2}`).join(", ");
        const values = changed.map((f) => patch[f]);
        await query(
          `UPDATE wine_vintages SET ${sets}, updated_at = now() WHERE id = $1`,
          [existingVintage.id, ...values],
        );
        await audit(user.id, "wine_vintage.csv_update",
          { type: "wine_vintage", id: existingVintage.id },
          { new: patch },
          { changed });
        outcomes.push({ line, status: "updated", wine_id: wineId, vintage_id: existingVintage.id, changed });
        summary.updated++;
      } else {
        const row = await one<{ id: string }>(
          `INSERT INTO wine_vintages
             (wine_id, vintage_text, status, mevushal, supervision_display, aging_display,
              bottle_sizes, tasting_note, food_pairing, short_description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [wineId, vintageText, nextStatus, mevushal, supervision, aging,
           sizes, tastingNote, foodPairing, shortDesc],
        );
        await audit(user.id, "wine_vintage.csv_create",
          { type: "wine_vintage", id: row!.id },
          { new: { wine_id: wineId, vintage_text: vintageText, source: "csv" } });
        outcomes.push({ line, status: "created", wine_id: wineId, vintage_id: row!.id });
        summary.created++;
      }
    } catch (err) {
      outcomes.push({ line, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      summary.failed++;
    }
  }

  if (!dryRun) {
    revalidatePath("/wines");
  }
  return { ok: true, summary };
}

// ---------------------------------------------------------------- producer delete
// Archive a single wine_vintage. Soft-delete only — row stays, deleted_at
// gets a timestamp so queries exclude it. Editor allowed; admins can unarchive.
export async function archiveWineVintage(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };
  const row = await one<{ id: string; wine_id: string; vintage_text: string | null }>(
    "SELECT id, wine_id, vintage_text FROM wine_vintages WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  if (!row) return { ok: false, message: "Vintage not found or already archived." };
  await query("UPDATE wine_vintages SET deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
  await audit(user.id, "wine_vintage.archive", { type: "wine_vintage", id },
    { old: { wine_id: row.wine_id, vintage_text: row.vintage_text } });
  revalidatePath("/wines");
  revalidatePath(`/wines/${id}`);
  return { ok: true };
}

export async function unarchiveWineVintage(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };
  const row = await one<{ id: string; wine_id: string }>(
    "SELECT id, wine_id FROM wine_vintages WHERE id = $1 AND deleted_at IS NOT NULL",
    [id],
  );
  if (!row) return { ok: false, message: "Vintage not found or not archived." };
  // Also need the parent wine + producer to be alive — restore them if they were cascaded.
  await query("UPDATE wines SET deleted_at = NULL, updated_at = now() WHERE id = (SELECT wine_id FROM wine_vintages WHERE id = $1) AND deleted_at IS NOT NULL", [id]);
  await query("UPDATE producers SET deleted_at = NULL, updated_at = now() WHERE id = (SELECT producer_id FROM wines WHERE id = (SELECT wine_id FROM wine_vintages WHERE id = $1)) AND deleted_at IS NOT NULL", [id]);
  await query("UPDATE wine_vintages SET deleted_at = NULL, updated_at = now() WHERE id = $1", [id]);
  await audit(user.id, "wine_vintage.unarchive", { type: "wine_vintage", id });
  revalidatePath("/wines");
  revalidatePath(`/wines/${id}`);
  return { ok: true };
}

// Archive an entire wine (soft-delete the wine + all its vintages). Editor.
export async function archiveWine(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };
  const row = await one<{ display_name: string; vintage_count: number }>(
    `SELECT w.display_name,
       (SELECT count(*)::int FROM wine_vintages v WHERE v.wine_id = w.id AND v.deleted_at IS NULL) AS vintage_count
     FROM wines w WHERE w.id = $1 AND w.deleted_at IS NULL`,
    [id],
  );
  if (!row) return { ok: false, message: "Wine not found or already archived." };
  await query("UPDATE wine_vintages SET deleted_at = now(), updated_at = now() WHERE wine_id = $1 AND deleted_at IS NULL", [id]);
  await query("UPDATE wines SET deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
  await audit(user.id, "wine.archive", { type: "wine", id },
    { old: { display_name: row.display_name, vintage_count: row.vintage_count } });
  revalidatePath("/wines");
  revalidatePath(`/wines/${id}`);
  return { ok: true };
}

export async function unarchiveWine(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };
  await query("UPDATE producers SET deleted_at = NULL, updated_at = now() WHERE id = (SELECT producer_id FROM wines WHERE id = $1) AND deleted_at IS NOT NULL", [id]);
  await query("UPDATE wines SET deleted_at = NULL, updated_at = now() WHERE id = $1", [id]);
  await query("UPDATE wine_vintages SET deleted_at = NULL, updated_at = now() WHERE wine_id = $1 AND deleted_at IS NOT NULL", [id]);
  await audit(user.id, "wine.unarchive", { type: "wine", id });
  revalidatePath("/wines");
  return { ok: true };
}

export async function unarchiveProducer(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };
  await query("UPDATE producers SET deleted_at = NULL, updated_at = now() WHERE id = $1", [id]);
  await query("UPDATE wines SET deleted_at = NULL, updated_at = now() WHERE producer_id = $1 AND deleted_at IS NOT NULL", [id]);
  await query("UPDATE wine_vintages SET deleted_at = NULL, updated_at = now() WHERE wine_id IN (SELECT id FROM wines WHERE producer_id = $1) AND deleted_at IS NOT NULL", [id]);
  await audit(user.id, "producer.unarchive", { type: "producer", id });
  revalidatePath("/producers");
  revalidatePath("/wines");
  return { ok: true };
}

export async function deleteProducer(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const user = await requireAdmin();   // destructive — admin only
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid id." };

  const row = await one<{ name: string; wine_count: number; vintage_count: number }>(
    `SELECT p.name,
       (SELECT count(*)::int FROM wines w WHERE w.producer_id = p.id AND w.deleted_at IS NULL) AS wine_count,
       (SELECT count(*)::int FROM wine_vintages v
          JOIN wines w ON w.id = v.wine_id
          WHERE w.producer_id = p.id AND v.deleted_at IS NULL) AS vintage_count
     FROM producers p WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  if (!row) return { ok: false, message: "Producer not found." };

  // Soft-delete the producer, their wines and all vintages in a single pass.
  await query("UPDATE wine_vintages SET deleted_at = now() WHERE wine_id IN (SELECT id FROM wines WHERE producer_id = $1) AND deleted_at IS NULL", [id]);
  await query("UPDATE wines SET deleted_at = now() WHERE producer_id = $1 AND deleted_at IS NULL", [id]);
  await query("UPDATE producers SET deleted_at = now() WHERE id = $1", [id]);

  await audit(user.id, "producer.delete",
    { type: "producer", id },
    { old: { name: row.name, wine_count: row.wine_count, vintage_count: row.vintage_count } });
  revalidatePath("/producers");
  revalidatePath("/wines");
  redirect("/producers");
}

// ---------------------------------------------------------------- xlsx imports (Phase 12)
import type { Row as XlsxRow } from "./xlsx";

export type XlsxImportSummary = {
  total: number;
  matched_by_sku: number;
  matched_by_name: number;
  created: number;
  skipped: number;
  updated: number;
  failed: number;
  outcomes: {
    line: number;
    sku: string | null;
    name: string | null;
    vintage: string | null;
    status: "matched" | "created" | "updated" | "skipped" | "failed";
    reason?: string;
    changed?: string[];
  }[];
};

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

// Pull sku prefix and derive country code (first 2 letters). IT1709011321 → IT
function skuCountry(sku: string | null): string | null {
  if (!sku) return null;
  const m = sku.match(/^([A-Z]{2})/);
  return m ? m[1] : null;
}

// Parse the "name" column from the owner's xlsx — strip vintage year off the
// end when present so we can match against our stored display_name.  Returns
// {displayName, inferredVintage}.
function splitNameAndVintage(name: string): { display: string; vintage: string | null } {
  const m = name.match(/^(.*?)[\s]*((?:19|20)\d{2}|NV)\s*(?:\d*\s*(?:L|ml))?\s*$/i);
  if (m) {
    const base = m[1].replace(/\s*[-,]\s*$/, "").trim();
    return { display: base || name, vintage: m[2].toUpperCase() };
  }
  return { display: name.trim(), vintage: null };
}

// Phase 17 — longest-prefix producer match. Walks the list of alive producers
// and returns the one whose name is a prefix of `itemName` (case-insensitive).
// If multiple match, the longest wins — "Chateau Teyssier Prestige" beats
// "Chateau Teyssier". A null return means caller should treat the first few
// words of the item name as a new producer.
async function matchProducerPrefix(itemName: string): Promise<{ id: string; name: string } | null> {
  const lower = itemName.toLowerCase().trim();
  const prods = await query<{ id: string; name: string }>(
    "SELECT id, name FROM producers WHERE deleted_at IS NULL ORDER BY length(name) DESC",
  );
  for (const p of prods) {
    const n = p.name.toLowerCase();
    if (lower === n || lower.startsWith(n + " ") || lower.startsWith(n + ",")) return p;
  }
  return null;
}

// Create a producer / wine / vintage from one inventory row when the match
// failed. Called only when the importer runs with create_missing=1.
async function createVintageFromInventoryRow(opts: {
  sku: string | null;
  name: string;
  vintage: string | null;
  packSize: number | null;
  userId: string;
}): Promise<{ id: string; wine_id: string; producer_id: string }> {
  const matched = await matchProducerPrefix(opts.name);
  let producerId: string;
  let producerName: string;
  let remainder: string;

  if (matched) {
    producerId = matched.id;
    producerName = matched.name;
    remainder = opts.name.slice(matched.name.length).replace(/^[\s,:-]+/, "").trim();
  } else {
    // No existing producer prefix — guess from the first 1–3 words.
    const parts = opts.name.split(/\s+/);
    const take = Math.min(3, parts.length);
    producerName = parts.slice(0, take).join(" ").replace(/,$/, "").trim();
    remainder = parts.slice(take).join(" ").replace(/^[\s,:-]+/, "").trim();
    // The producers_name_idx is partial (WHERE deleted_at IS NULL), so
    // ON CONFLICT would need the partial-index predicate repeated — safer to
    // SELECT first and INSERT only if no row exists.
    const existingProd = await one<{ id: string }>(
      "SELECT id FROM producers WHERE lower(name) = lower($1) AND deleted_at IS NULL",
      [producerName],
    );
    if (existingProd) {
      producerId = existingProd.id;
    } else {
      const slug = producerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const prodRow = await one<{ id: string }>(
        `INSERT INTO producers (name, slug) VALUES ($1, $2) RETURNING id`,
        [producerName, slug || "producer-" + Math.random().toString(36).slice(2, 8)],
      );
      producerId = prodRow!.id;
    }
  }

  // Wine display_name: whatever's left of the Item string after the producer,
  // with any trailing vintage year stripped. If nothing's left, fall back to
  // the producer name itself.
  const wineBase = remainder || producerName;
  const { display: wineDisplay } = splitNameAndVintage(wineBase);
  const wineSlug = (wineDisplay || "wine").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Find existing wine under this producer, create otherwise.
  const existingWine = await one<{ id: string }>(
    "SELECT id FROM wines WHERE producer_id = $1 AND lower(display_name) = lower($2) AND deleted_at IS NULL",
    [producerId, wineDisplay],
  );
  let wineId: string;
  if (existingWine) {
    wineId = existingWine.id;
  } else {
    // wines.slug is UNIQUE NOT NULL — try the natural slug first, suffix on collision.
    const baseSlug = `${producerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${wineSlug}`.slice(0, 170);
    let slugTry = baseSlug || "wine";
    let attempt = 0;
    // Guard against a bizarre loop.
    while (attempt < 20) {
      const taken = await one<{ id: string }>("SELECT id FROM wines WHERE slug = $1", [slugTry]);
      if (!taken) break;
      attempt++;
      slugTry = `${baseSlug}-${attempt}`;
    }
    const w = await one<{ id: string }>(
      `INSERT INTO wines (producer_id, display_name, canonical_name, slug)
       VALUES ($1, $2, $2, $3) RETURNING id`,
      [producerId, wineDisplay, slugTry],
    );
    wineId = w!.id;
  }

  // Vintage: if the row carries one, use it; otherwise null (NV).
  const existingVin = await one<{ id: string }>(
    "SELECT id FROM wine_vintages WHERE wine_id = $1 AND coalesce(vintage_text, '') = coalesce($2, '') AND deleted_at IS NULL",
    [wineId, opts.vintage],
  );
  let vintageId: string;
  if (existingVin) {
    vintageId = existingVin.id;
  } else {
    const v = await one<{ id: string }>(
      `INSERT INTO wine_vintages (wine_id, vintage_text, status, sku, pack_size)
       VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
      [wineId, opts.vintage, opts.sku, opts.packSize],
    );
    vintageId = v!.id;
    await audit(opts.userId, "wine_vintage.create_from_inventory",
      { type: "wine_vintage", id: vintageId },
      { new: { producer: producerName, wine: wineDisplay, vintage: opts.vintage, sku: opts.sku } });
  }
  return { id: vintageId, wine_id: wineId, producer_id: producerId };
}

async function findVintageBySkuOrName(
  sku: string | null,
  displayName: string | null,
  vintageText: string | null,
): Promise<{ id: string; wine_id: string } | null> {
  if (sku) {
    const bySku = await one<{ id: string; wine_id: string }>(
      "SELECT id, wine_id FROM wine_vintages WHERE lower(sku) = lower($1) AND deleted_at IS NULL LIMIT 1",
      [sku],
    );
    if (bySku) return bySku;
  }
  if (displayName) {
    const vt = vintageText ?? "";
    const match = await one<{ id: string; wine_id: string }>(
      `SELECT v.id, v.wine_id
         FROM wine_vintages v JOIN wines w ON w.id = v.wine_id
        WHERE w.deleted_at IS NULL AND v.deleted_at IS NULL
          AND lower(w.display_name) = lower($1)
          AND coalesce(v.vintage_text, '') = coalesce($2, '')
        LIMIT 1`,
      [displayName, vt || null],
    );
    if (match) return match;
  }
  return null;
}

// --------- INVENTORY importer ----------
// Columns we care about (owner's file uses these headers):
//   "Item Number"       -> sku
//   "Item"              -> name
//   "UoM"               -> "12 Bottle Case" / "6 Bottle Case" / ...
//   "Inventory UoM Qty On Hand"      -> stock_cases_on_hand
//   "Inventory UoM Qty Allocated"    -> stock_cases_allocated
//   "Inventory UoM Qty Available"    -> stock_cases_available
//   "Inventory UoM Qty Inbound"      -> stock_cases_inbound
export async function importInventoryXlsx(formData: FormData): Promise<{ ok: boolean; summary?: XlsxImportSummary; message?: string }> {
  const user = await requireEditor();
  const file = formData.get("file");
  const dryRun = formData.get("dry_run") === "1";
  // Phase 17 opt-in: when true, rows that didn't match an existing vintage
  // get a producer / wine / vintage auto-created from the row's "Item" column.
  const createMissing = formData.get("create_missing") === "1";
  if (!(file instanceof File)) return { ok: false, message: "No file uploaded." };
  const bytes = await file.arrayBuffer();

  const { parseWorksheet, pick } = await import("./xlsx");
  let rows: XlsxRow[];
  try { rows = await parseWorksheet(bytes); }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }

  const summary: XlsxImportSummary = {
    total: rows.length, matched_by_sku: 0, matched_by_name: 0,
    created: 0, skipped: 0, updated: 0, failed: 0, outcomes: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2; // header is line 1
    const sku = toText(pick(row, "item number", "item#", "sku"));
    const name = toText(pick(row, "item", "item name"));
    const uom = toText(pick(row, "uom"));
    const onHand = toNum(pick(row, "inventory uom qty on hand", "qty on hand"));
    const allocated = toNum(pick(row, "inventory uom qty allocated", "qty allocated"));
    const available = toNum(pick(row, "inventory uom qty available", "qty available"));
    const inbound = toNum(pick(row, "inventory uom qty inbound", "qty inbound"));
    const packSize = uom ? (uom.match(/^(\d+)\s*Bottle/i)?.[1] ? parseInt(uom.match(/^(\d+)\s*Bottle/i)![1], 10) : null) : null;

    if (!sku && !name) {
      summary.skipped++;
      summary.outcomes.push({ line, sku, name, vintage: null, status: "skipped", reason: "no sku or name" });
      continue;
    }
    // Guess the vintage by splitting off the trailing year on the name.
    const { display, vintage } = name ? splitNameAndVintage(name) : { display: "", vintage: null };
    try {
      let found = await findVintageBySkuOrName(sku, display || null, vintage);
      let didCreate = false;

      if (!found) {
        if (!createMissing || !name) {
          summary.skipped++;
          summary.outcomes.push({
            line, sku, name, vintage,
            status: "skipped",
            reason: createMissing
              ? "No item name to create from"
              : `No matching wine — tick "Create missing" to auto-create a draft`,
          });
          continue;
        }
        if (dryRun) {
          // Preview: don't touch the DB, just report what would happen.
          summary.created++;
          summary.outcomes.push({
            line, sku, name, vintage,
            status: "created",
            reason: "would create new producer/wine/vintage",
          });
          continue;
        }
        const created = await createVintageFromInventoryRow({
          sku, name: display || name, vintage, packSize, userId: user.id,
        });
        found = { id: created.id, wine_id: created.wine_id };
        didCreate = true;
        summary.created++;
      } else {
        if (sku) summary.matched_by_sku++;
        else summary.matched_by_name++;
      }

      if (dryRun) {
        summary.outcomes.push({ line, sku, name, vintage, status: "matched" });
        summary.updated++;
        continue;
      }
      await query(
        `UPDATE wine_vintages SET
           sku = coalesce($2, sku),
           pack_size = coalesce($3, pack_size),
           stock_cases_available = $4,
           stock_cases_allocated = $5,
           stock_cases_inbound   = $6,
           stock_updated_at      = now(),
           updated_at            = now()
         WHERE id = $1`,
        [found.id, sku, packSize, available ?? onHand ?? null, allocated, inbound],
      );
      if (!didCreate) summary.updated++;
      summary.outcomes.push({ line, sku, name, vintage, status: didCreate ? "created" : "updated" });
    } catch (err) {
      summary.failed++;
      summary.outcomes.push({ line, sku, name, vintage, status: "failed", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!dryRun) {
    revalidatePath("/wines");
    await audit(user.id, "inventory.import",
      { type: "system", id: "inventory_import" },
      { new: {
          matched_by_sku: summary.matched_by_sku,
          matched_by_name: summary.matched_by_name,
          updated: summary.updated,
          created: summary.created,
          skipped: summary.skipped,
          failed: summary.failed,
          create_missing_enabled: createMissing,
      } });
  }
  return { ok: true, summary };
}

// --------- PRICES importer ----------
// Columns in the owner's Price_Posting sheet:
//   "item#"       sku
//   "Item"        name
//   "size"        750 / 1500 / 3000 / 375  (ml)
//   "Vintage"     year
//   "Color"       TR / TW / RO / ...
//   "PK#/cs"      bottles per case
//   "FrontLine"   list case price
//   "Bottle"      per-bottle price
//   "2cs"/"3cs"/"4cs"/"5cs"/"10cs"/"25cs" + per-bottle companion columns
const PRICE_TIERS: { tier: "frontline" | "2cs" | "3cs" | "4cs" | "5cs" | "10cs" | "25cs"; min: number; headers: [string, string] }[] = [
  { tier: "frontline", min: 1,  headers: ["FrontLine", "Bottle"] },
  { tier: "2cs",       min: 2,  headers: ["2cs", "Bottle .1"] },
  { tier: "3cs",       min: 3,  headers: ["3cs", "Bottle .2"] },
  { tier: "4cs",       min: 4,  headers: ["4 cs", "Bottle .3"] },
  { tier: "5cs",       min: 5,  headers: ["5cs", "Bottle .4"] },
  { tier: "10cs",      min: 10, headers: ["10cs", "Bottle .5"] },
  { tier: "25cs",      min: 25, headers: ["25cs", "Bottle .6"] },
];

export async function importPricesXlsx(formData: FormData): Promise<{ ok: boolean; summary?: XlsxImportSummary; message?: string }> {
  const user = await requireEditor();
  const file = formData.get("file");
  const dryRun = formData.get("dry_run") === "1";
  if (!(file instanceof File)) return { ok: false, message: "No file uploaded." };
  const bytes = await file.arrayBuffer();

  const { parseWorksheet, pick } = await import("./xlsx");
  let rows: XlsxRow[];
  try { rows = await parseWorksheet(bytes); }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }

  const summary: XlsxImportSummary = {
    total: rows.length, matched_by_sku: 0, matched_by_name: 0,
    created: 0, skipped: 0, updated: 0, failed: 0, outcomes: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const sku = toText(pick(row, "item#", "item number", "sku"));
    const name = toText(pick(row, "item"));
    const vintageYear = toInt(pick(row, "vintage"));
    const vintage = vintageYear ? String(vintageYear) : null;

    if (!sku && !name) { summary.skipped++; summary.outcomes.push({ line, sku, name, vintage, status: "skipped", reason: "no sku or name" }); continue; }
    try {
      const { display } = name ? splitNameAndVintage(name) : { display: "" };
      const found = await findVintageBySkuOrName(sku, display || null, vintage);
      if (!found) {
        summary.skipped++;
        summary.outcomes.push({ line, sku, name, vintage, status: "skipped", reason: "no matching wine/vintage" });
        continue;
      }
      if (sku) summary.matched_by_sku++;
      else summary.matched_by_name++;

      const packSize = toInt(pick(row, "pk#/cs", "pk/cs", "pack size"));
      const changed: string[] = [];
      if (!dryRun) {
        if (packSize) {
          await query(
            "UPDATE wine_vintages SET pack_size = coalesce($2, pack_size), sku = coalesce($3, sku), updated_at = now() WHERE id = $1",
            [found.id, packSize, sku],
          );
        }
        for (const t of PRICE_TIERS) {
          const casePrice = toNum(pick(row, t.headers[0]));
          const bottlePrice = toNum(pick(row, t.headers[1]));
          if (casePrice === null || casePrice === 0) {
            // Treat 0 / blank as "no tier" and remove any stale row.
            await query(
              "DELETE FROM wine_vintage_prices WHERE vintage_id = $1 AND tier = $2",
              [found.id, t.tier],
            );
            continue;
          }
          await query(
            `INSERT INTO wine_vintage_prices (vintage_id, tier, min_cases, case_price, bottle_price)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (vintage_id, tier)
             DO UPDATE SET case_price = EXCLUDED.case_price, bottle_price = EXCLUDED.bottle_price,
                           min_cases = EXCLUDED.min_cases, updated_at = now()`,
            [found.id, t.tier, t.min, casePrice, bottlePrice],
          );
          changed.push(t.tier);
        }
      }
      summary.updated++;
      summary.outcomes.push({ line, sku, name, vintage, status: dryRun ? "matched" : "updated", changed });
    } catch (err) {
      summary.failed++;
      summary.outcomes.push({ line, sku, name, vintage, status: "failed", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!dryRun) {
    revalidatePath("/wines");
    await audit(user.id, "prices.import",
      { type: "system", id: "prices_import" },
      { new: { matched: summary.updated, skipped: summary.skipped, failed: summary.failed } });
  }
  return { ok: true, summary };
}

// --------- Legacy asset backfill ----------
// Downloads every wine_vintages.legacy->>img URL that isn't yet an asset,
// pushes it into Firebase Storage, SHA-256 dedupes, and sets bottle_asset_id.
export async function backfillLegacyBottles(): Promise<{ ok: boolean; summary?: { total: number; imported: number; deduped: number; failed: number; outcomes: { vintage_id: string; status: string; message?: string }[] }; message?: string }> {
  const user = await requireEditor();
  const { storageConfigured, uploadBytes } = await import("./storage");
  if (!storageConfigured()) return { ok: false, message: "Firebase Storage is not configured." };

  const vintages = await query<{ id: string; img: string | null }>(
    `SELECT id, legacy->>'img' AS img FROM wine_vintages
       WHERE deleted_at IS NULL AND bottle_asset_id IS NULL
         AND legacy->>'img' IS NOT NULL`,
  );
  const summary = { total: vintages.length, imported: 0, deduped: 0, failed: 0,
    outcomes: [] as { vintage_id: string; status: string; message?: string }[] };

  for (const v of vintages) {
    if (!v.img) { summary.failed++; continue; }
    const url = v.img.startsWith("http") ? v.img : `https://www.mandmimporters.com${v.img}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await res.arrayBuffer());
      const checksum = crypto.createHash("sha256").update(buf).digest("hex");
      const existing = await one<{ id: string }>(
        "SELECT id FROM assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL",
        [checksum],
      );
      let assetId: string;
      if (existing) {
        assetId = existing.id;
        summary.deduped++;
      } else {
        const id = crypto.randomUUID();
        const ext = contentType.includes("png") ? "png"
                  : contentType.includes("webp") ? "webp"
                  : "jpg";
        const storagePath = `assets/originals/${id}.${ext}`;
        await uploadBytes({
          storagePath,
          bytes: buf,
          contentType,
          metadata: { source: "legacy_website", originalUrl: url },
        });
        const fileName = url.split("/").pop()?.split("?")[0]?.slice(0, 240) ?? "bottle.jpg";
        const row = await one<{ id: string }>(
          `INSERT INTO assets (id, kind, derivative, storage_path, file_name, mime_type, bytes, checksum_sha256, uploaded_by, metadata)
           VALUES ($1, 'bottle', 'original', $2, $3, $4, $5, $6, $7,
                   jsonb_build_object('source', 'legacy_website', 'originalUrl', $8::text))
           RETURNING id`,
          [id, storagePath, fileName, contentType, buf.byteLength, checksum, user.id, url],
        );
        assetId = row!.id;
        summary.imported++;
      }
      await query(
        "UPDATE wine_vintages SET bottle_asset_id = $2, updated_at = now() WHERE id = $1",
        [v.id, assetId],
      );
      summary.outcomes.push({ vintage_id: v.id, status: existing ? "deduped" : "imported" });
    } catch (err) {
      summary.failed++;
      summary.outcomes.push({ vintage_id: v.id, status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  revalidatePath("/assets");
  revalidatePath("/wines");
  await audit(user.id, "assets.backfill_legacy",
    { type: "system", id: "backfill_legacy" },
    { new: { imported: summary.imported, deduped: summary.deduped, failed: summary.failed } });
  return { ok: true, summary };
}
