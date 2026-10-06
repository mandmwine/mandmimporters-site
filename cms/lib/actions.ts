"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireEditor, type Role } from "./auth";
import { one, query } from "./db";
import { audit } from "./audit";
import { adminAuth } from "./firebase-admin";

// ---------------------------------------------------------------- review flags
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
function dlev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const next = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = row[j];
      row[j] = next;
    }
  }
  return row[n];
}

async function suggestGrape(name: string): Promise<string | null> {
  const all = await query<{ canonical_name: string }>("SELECT canonical_name FROM grapes");
  const n = name.toLowerCase();
  let best: { name: string; d: number } | null = null;
  for (const row of all) {
    const d = dlev(n, row.canonical_name.toLowerCase());
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
  await audit(user.id, "wine_vintage.grapes.update",
    { type: "wine_vintage", id: vintageId, field: "grapes" },
    { new: text }, { unknown: unknown.map((u) => u.name) });
  revalidatePath(`/wines/${vintageId}`);
}

