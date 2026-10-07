"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireEditor, type Role } from "./auth";
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

const RENDER_MODES = ["detailed", "compact", "hybrid"] as const;
const SECTION_KINDS = [
  "cover", "intro", "toc", "regional_index", "divider", "producer_intro",
  "wines", "producer_index", "contact", "back_cover",
] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

// Create a catalog from a bare name and (optionally) a starter list of wines.
// Scaffolds the default section skeleton so the user doesn't start empty.
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

export async function renameCatalog(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const name = (s(formData, "name") ?? "").trim();
  const season = s(formData, "season");
  const renderMode = (RENDER_MODES as readonly string[]).includes(String(formData.get("render_mode")))
    ? String(formData.get("render_mode"))
    : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !name) return;
  await query(
    `UPDATE catalogs
       SET name = $2, season = $3,
           render_mode = COALESCE($4, render_mode),
           updated_at = now()
     WHERE id = $1`,
    [id, name, season, renderMode],
  );
  await audit(user.id, "catalog.update", { type: "catalog", id }, { new: { name, season, render_mode: renderMode } });
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

export async function removeCatalogItem(formData: FormData) {
  const user = await requireEditor();
  const itemId = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return;
  const row = await one<{ catalog_id: string }>("SELECT catalog_id FROM catalog_items WHERE id = $1", [itemId]);
  await query("DELETE FROM catalog_items WHERE id = $1", [itemId]);
  if (row) {
    await audit(user.id, "catalog_item.delete", { type: "catalog_item", id: itemId });
    revalidatePath(`/catalogs/${row.catalog_id}`);
  }
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

export async function setSectionRenderMode(formData: FormData) {
  const user = await requireEditor();
  const sectionId = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) return;
  if (!["detailed", "lineup", "trade", "compact"].includes(mode)) return;
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
  const expiresRaw = s(formData, "expires_at");
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { ok: false, message: "Invalid expiry date." };
  }

  const exists = await one("SELECT id FROM catalogs WHERE id = $1", [catalogId]);
  if (!exists) return { ok: false, message: "Catalog not found." };

  const token = newShareToken();
  await query(
    `INSERT INTO catalog_shares (catalog_id, token, label, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [catalogId, token, label, user.id, expiresAt],
  );
  await audit(user.id, "catalog_share.create", { type: "catalog", id: catalogId },
    { new: { token: token.slice(0, 6) + "…", label, expires_at: expiresAt?.toISOString() ?? null } });
  revalidatePath(`/catalogs/${catalogId}`);
  return { ok: true, token };
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


