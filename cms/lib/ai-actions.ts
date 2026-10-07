// AI-driven server actions. Every call is written to ai_actions with status
// 'proposed'; the user then Accepts (applies to the entity) or Rejects.
"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "./auth";
import { one, query } from "./db";
import { audit } from "./audit";
import { aiConfigured, askClaude, askClaudeWithSearch } from "./ai";

export type ProposeResult =
  | { ok: true; id: string; proposedText: string; webResults?: { title: string; url: string }[] }
  | { ok: false; error: string };

// Shared internal helper: calls Claude, stores the ai_actions row, returns the
// proposal to the caller.
async function propose(opts: {
  userId: string;
  action: string;
  entity: { type: string; id: string; field?: string };
  system?: string;
  user: string;
  model?: "haiku" | "sonnet" | "opus";
  useSearch?: boolean;
  payload?: Record<string, unknown>;
}): Promise<ProposeResult> {
  if (!aiConfigured()) {
    return { ok: false, error: "Set ANTHROPIC_API_KEY in Vercel to enable AI features." };
  }
  try {
    const res = opts.useSearch
      ? await askClaudeWithSearch({ user: opts.user, system: opts.system, model: opts.model })
      : await askClaude({ user: opts.user, system: opts.system, model: opts.model });
    const row = await one<{ id: string }>(
      `INSERT INTO ai_actions
         (user_id, action, entity_type, entity_id, field_name, input, output, model, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'proposed')
       RETURNING id`,
      [
        opts.userId,
        opts.action,
        opts.entity.type,
        opts.entity.id,
        opts.entity.field ?? null,
        JSON.stringify({ prompt: opts.user.slice(0, 4000), payload: opts.payload ?? {} }),
        JSON.stringify({ text: res.text, web_results: res.web_results ?? [] }),
        res.model,
      ],
    );
    await audit(opts.userId, `ai.${opts.action}.proposed`, { ...opts.entity }, undefined, {
      tokens: { in: res.input_tokens, out: res.output_tokens },
    });
    return { ok: true, id: row!.id, proposedText: res.text, webResults: res.web_results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai] propose failed", opts.action, msg);
    return { ok: false, error: msg };
  }
}

// -- Draft tasting note from the wine's own data ----------------------------

export async function proposeTastingNote(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return { ok: false, error: "Not found" };
  const data = await loadWineBrief(vintageId);
  if (!data) return { ok: false, error: "Not found" };

  const prompt = `Write a tasting note for a wine catalog data sheet.

WINE
Producer: ${data.producer}
Wine: ${data.canonical_name}
Vintage: ${data.vintage_text ?? "NV"}
Country/Region/Appellation: ${[data.appellation, data.region, data.country].filter(Boolean).join(" / ") || "—"}
Grape(s): ${data.grapes || "—"}
Designation: ${data.special_designation || "—"}
Aging: ${data.aging_display || "—"}

STYLE
Length: 2–4 short sentences, ~250–400 characters total.
Mention: color, principal aromas, principal flavors, structure (acid/tannin/body), finish.
Do not include a header, don't repeat the wine's name, don't speculate about scores or ratings.
Return the tasting note only — no commentary, no markdown.`;
  return propose({ userId: user.id, action: "tasting_note", entity: { type: "wine_vintage", id: vintageId, field: "tasting_note" }, user: prompt, payload: data });
}

// -- Condense an overlong tasting note --------------------------------------

export async function proposeCondense(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  const field = String(formData.get("field") ?? "tasting_note");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return { ok: false, error: "Not found" };
  if (!["tasting_note", "food_pairing", "short_description", "winery_summary_short"].includes(field))
    return { ok: false, error: "Unknown field" };

  const current = await loadFieldValue(vintageId, field);
  if (!current) return { ok: false, error: "No existing text to condense." };

  const prompt = `Condense the following copy to fit a wine catalog data sheet without losing its character.
Target: around 70% of the original length. Keep the specific nouns and adjectives; cut repetition,
qualifiers, and filler. Preserve the voice.

ORIGINAL:
${current}

Return the condensed version only.`;
  return propose({
    userId: user.id,
    action: "condense",
    entity: { type: "wine_vintage", id: vintageId, field },
    user: prompt,
    payload: { original_length: current.length },
  });
}

// -- Rewrite existing copy in the house voice -------------------------------

export async function proposeRewriteVoice(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  const field = String(formData.get("field") ?? "tasting_note");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return { ok: false, error: "Not found" };
  const current = await loadFieldValue(vintageId, field);
  if (!current) return { ok: false, error: "No existing text to rewrite." };

  const prompt = `Rewrite the following in the M&M Imports catalog voice. Keep every fact. Keep roughly the
same length. Remove sommelier cliches, redundant qualifiers, and anything that sounds like
marketing copy. Make it specific and quiet.

ORIGINAL:
${current}

Return the rewritten version only.`;
  return propose({ userId: user.id, action: "rewrite_voice", entity: { type: "wine_vintage", id: vintageId, field }, user: prompt });
}

// -- Find missing critic scores via Claude web search -----------------------

export async function proposeFindScores(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return { ok: false, error: "Not found" };
  const data = await loadWineBrief(vintageId);
  if (!data) return { ok: false, error: "Not found" };

  const prompt = `Find critic scores for this wine on the public internet.

Wine: ${data.producer} — ${data.canonical_name} ${data.vintage_text ?? ""}
Appellation: ${data.appellation ?? data.region ?? data.country ?? "unknown"}

Preferred sources: James Suckling, Wine Advocate, Vinous, Decanter, Jeb Dunnuck,
Wine Spectator, Wine Enthusiast, Jancis Robinson, Burghound, Jane Anson, Falstaff.

Return your findings as JSON only, in this exact shape, with no commentary:
{"scores":[{"critic":"James Suckling","score":"94","year":2024,"quote":"...","url":"https://..."}]}

Rules:
- Only report scores where you have a specific URL and a specific numeric score.
- Prefer the exact vintage shown above; include older-vintage scores only if 90+ and mark year.
- Omit scores for barrel samples unless no other score exists for this vintage.
- If you find nothing, return {"scores":[]}.
- Do not fabricate. If uncertain, omit.`;
  const result = await propose({
    userId: user.id,
    action: "find_scores",
    entity: { type: "wine_vintage", id: vintageId, field: "scores" },
    user: prompt,
    useSearch: true,
    model: "haiku",
    payload: data,
  });
  // Diagnostic: log the raw count so we can tell "silent 0" from a parse fail.
  if (result.ok) {
    try {
      const parsed = JSON.parse(result.proposedText) as { scores?: unknown[] };
      const n = Array.isArray(parsed.scores) ? parsed.scores.length : -1;
      console.log(`[ai] find_scores ${vintageId}: ${n} scores returned`);
    } catch {
      console.warn(`[ai] find_scores ${vintageId}: non-JSON output (${result.proposedText.slice(0, 120)}…)`);
    }
  }
  return result;
}

// -- Fill vintage details (aging / grapes / mevushal / designation) via web search --

export async function proposeFillVintageDetails(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const vintageId = String(formData.get("wine_vintage_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(vintageId)) return { ok: false, error: "Not found" };
  const data = await loadWineBrief(vintageId);
  if (!data) return { ok: false, error: "Not found" };

  const prompt = `Find the technical details for this specific kosher wine on the public internet.

Wine: ${data.producer} — ${data.canonical_name} ${data.vintage_text ?? ""}
Appellation: ${data.appellation ?? data.region ?? data.country ?? "unknown"}

Preferred sources: the producer's own website, a reputable wine database (CellarTracker,
Vinous, Wine-Searcher), or a trusted kosher-wine retailer (KosherWine.com, Royal Wine).

Return your findings as JSON only, in this exact shape, with no commentary or markdown fences:
{
  "aging": "16 months in French oak",
  "special_designation": "Reserva",
  "mevushal": "no",
  "grapes": [
    {"name": "Tempranillo", "percentage": 90},
    {"name": "Garnacha", "percentage": 10}
  ],
  "confidence": "high|medium|low",
  "notes": "one short line explaining what came from where"
}

Rules:
- Every field is optional. If you cannot find a specific value, omit the field entirely.
- "mevushal" must be exactly "yes", "no", or omitted. Most kosher wines are not mevushal unless
  explicitly labeled as such. Say "no" only when a trusted source confirms it is not mevushal.
- "aging" should be short and specific (barrel type, duration). Omit instead of guessing.
- "special_designation" is official text on the label — "Reserva", "Gran Reserva", "Crianza",
  "Grand Cru", "Grand Cru Classé", etc. Omit if not applicable.
- "grapes" percentages must sum to 100 when all varieties are known. Omit percentage when uncertain.
  Use variety names in English (Tempranillo, Cabernet Sauvignon, not Tempranillos).
- Do not fabricate. If nothing can be verified, return {}.`;
  return propose({
    userId: user.id,
    action: "fill_vintage_details",
    entity: { type: "wine_vintage", id: vintageId, field: "vintage_details" },
    user: prompt,
    useSearch: true,
    model: "haiku",
    payload: data,
  });
}

// -- Short producer bio via web search --------------------------------------

export async function proposeProducerBio(formData: FormData): Promise<ProposeResult> {
  const user = await requireEditor();
  const producerId = String(formData.get("producer_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(producerId)) return { ok: false, error: "Not found" };
  const row = await one<{ name: string }>(
    "SELECT name FROM producers WHERE id = $1",
    [producerId],
  );
  if (!row) return { ok: false, error: "Not found" };

  const prompt = `Write a short, factual bio of this kosher wine producer for the M & M Imports catalog.

Producer: ${row.name}

Research the winery on the public internet first. Then write 2–3 short sentences (around
250–400 characters total) covering: where they are, who owns or founded the winery, what
distinguishes their program (style, era founded, varietals, kosher certifying body if known).

Rules:
- Only state facts you have a source for. No marketing adjectives. No superlatives.
- Do not fabricate names or dates. If you cannot find something, don't say it.
- Return the bio only — no header, no citations in-line, no markdown.`;
  return propose({
    userId: user.id,
    action: "producer_bio",
    entity: { type: "producer", id: producerId, field: "winery_summary_short" },
    user: prompt,
    useSearch: true,
    model: "haiku",
    payload: { name: row.name },
  });
}

// -- Accept a proposal: apply its text to the entity's field -----------------

export async function acceptProposal(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    field_name: string | null;
    output: { text: string; web_results?: { title: string; url: string }[] };
    status: string;
  }>("SELECT id, action, entity_type, entity_id, field_name, output, status FROM ai_actions WHERE id = $1", [id]);
  if (!row || row.status !== "proposed") return;

  if (row.entity_type === "wine_vintage" && row.field_name) {
    const field = row.field_name;
    if (["tasting_note", "food_pairing", "short_description", "wine_story"].includes(field)) {
      await query(`UPDATE wine_vintages SET ${field} = $2, updated_at = now() WHERE id = $1`, [row.entity_id, row.output.text]);
    } else if (field === "vintage_details") {
      // Fill multiple fields from one web-search result. Only touch fields the
      // user actually left blank — never overwrite editor-set values.
      try {
        const txt = row.output.text.trim().replace(/^```json\s*|\s*```$/g, "");
        const payload = JSON.parse(txt) as {
          aging?: string;
          special_designation?: string;
          mevushal?: "yes" | "no";
          grapes?: Array<{ name?: string; percentage?: number }>;
        };
        const current = await one<{ aging_display: string | null; special_designation: string | null; mevushal: string }>(
          "SELECT aging_display, special_designation, mevushal FROM wine_vintages WHERE id = $1",
          [row.entity_id],
        );
        const sets: string[] = [];
        const vals: unknown[] = [row.entity_id];
        if (payload.aging && !current?.aging_display) {
          vals.push(payload.aging);
          sets.push(`aging_display = $${vals.length}`);
        }
        if (payload.special_designation && !current?.special_designation) {
          vals.push(payload.special_designation);
          sets.push(`special_designation = $${vals.length}`);
        }
        if (payload.mevushal && current?.mevushal === "unknown") {
          vals.push(payload.mevushal);
          sets.push(`mevushal = $${vals.length}`);
        }
        if (sets.length > 0) {
          sets.push("updated_at = now()");
          await query(`UPDATE wine_vintages SET ${sets.join(", ")} WHERE id = $1`, vals);
        }
        // Replace grapes only when the wine has none set yet.
        if (Array.isArray(payload.grapes) && payload.grapes.length > 0) {
          const existing = await query<{ grape_id: string }>(
            "SELECT grape_id FROM wine_grapes WHERE wine_vintage_id = $1",
            [row.entity_id],
          );
          if (existing.length === 0) {
            let order = 0;
            for (const g of payload.grapes) {
              if (!g.name) continue;
              const grapeId = await resolveGrape(g.name);
              if (!grapeId) continue;
              const pct = typeof g.percentage === "number" && g.percentage > 0 && g.percentage <= 100
                ? g.percentage.toFixed(2) : null;
              await query(
                `INSERT INTO wine_grapes (wine_vintage_id, grape_id, percentage, display_order)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (wine_vintage_id, grape_id) DO NOTHING`,
                [row.entity_id, grapeId, pct, order++],
              );
            }
          }
        }
      } catch (err) {
        console.warn("[ai] vintage_details parse failed", err);
      }
    } else if (field === "scores") {
      // Parse the JSON Claude returned and insert as pending scores, flagged
      // for the user to verify (they're still 'draft' until approved on the
      // scores panel itself).
      try {
        const payload = JSON.parse(row.output.text) as { scores?: Array<{ critic?: string; score?: string; year?: number; quote?: string; url?: string }> };
        for (const s of payload.scores ?? []) {
          if (!s.critic || !s.score) continue;
          const criticId = await resolveCritic(s.critic);
          await query(
            `INSERT INTO wine_scores
               (wine_vintage_id, critic_id, score_text, numeric_score, review_year, review_url, is_primary, raw_text, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, false, $7,
                     coalesce((SELECT max(display_order) + 1 FROM wine_scores WHERE wine_vintage_id = $1), 0))`,
            [
              row.entity_id, criticId, s.score, parseFloat(String(s.score)) || null,
              s.year ?? null, s.url ?? null, s.quote ?? null,
            ],
          );
        }
      } catch (err) {
        console.warn("[ai] score parse failed", err);
      }
    }
  } else if (row.entity_type === "producer" && row.field_name === "winery_summary_short") {
    await query("UPDATE producers SET winery_summary_short = $2, updated_at = now() WHERE id = $1", [row.entity_id, row.output.text]);
  }

  await query("UPDATE ai_actions SET status = 'accepted', decided_at = now() WHERE id = $1", [id]);
  await audit(user.id, `ai.${row.action}.accepted`, { type: row.entity_type, id: row.entity_id, field: row.field_name ?? undefined });
  revalidatePath(`/wines/${row.entity_id}`);
  revalidatePath(`/sheet/${row.entity_id}`);
}

export async function rejectProposal(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const note = (formData.get("note") as string | null)?.toString().slice(0, 500) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await one<{ action: string; entity_type: string; entity_id: string; field_name: string | null; status: string }>(
    "SELECT action, entity_type, entity_id, field_name, status FROM ai_actions WHERE id = $1",
    [id],
  );
  if (!row || row.status !== "proposed") return;
  await query(
    `UPDATE ai_actions SET status = 'rejected', decided_at = now(),
       input = jsonb_set(coalesce(input, '{}'::jsonb), '{reason}', to_jsonb($2::text))
     WHERE id = $1`,
    [id, note ?? ""],
  );
  await audit(user.id, `ai.${row.action}.rejected`, { type: row.entity_type, id: row.entity_id, field: row.field_name ?? undefined }, undefined, { note });
  revalidatePath(`/wines/${row.entity_id}`);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type WineBrief = {
  producer: string;
  canonical_name: string;
  vintage_text: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string;
  special_designation: string | null;
  aging_display: string | null;
};

async function loadWineBrief(vintageId: string): Promise<WineBrief | null> {
  const v = await one<{
    canonical_name: string;
    producer: string;
    vintage_text: string | null;
    location_id: string | null;
    special_designation: string | null;
    aging_display: string | null;
  }>(
    `SELECT w.canonical_name, p.name AS producer, v.vintage_text, v.location_id,
            v.special_designation, v.aging_display
     FROM wine_vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id
     WHERE v.id = $1`,
    [vintageId],
  );
  if (!v) return null;
  const chain = await query<{ type: string; name: string }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, type, name FROM locations WHERE id = $1
       UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
     ) SELECT type, name FROM up`,
    [v.location_id],
  );
  const grapes = await query<{ name: string; percentage: string | null }>(
    `SELECT g.canonical_name AS name, wg.percentage FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
     WHERE wg.wine_vintage_id = $1 ORDER BY wg.display_order`,
    [vintageId],
  );
  const grapeText = grapes
    .map((g) => (g.percentage ? `${Math.round(Number(g.percentage))}% ${g.name}` : g.name))
    .join(", ");
  const loc = (t: string) => chain.find((c) => c.type === t)?.name ?? null;
  return {
    producer: v.producer,
    canonical_name: v.canonical_name,
    vintage_text: v.vintage_text,
    country: loc("country"),
    region: loc("region"),
    appellation: loc("appellation"),
    grapes: grapeText,
    special_designation: v.special_designation,
    aging_display: v.aging_display,
  };
}

async function loadFieldValue(vintageId: string, field: string): Promise<string | null> {
  if (!/^[a-z_]+$/.test(field)) return null;
  const r = await one<{ v: string | null }>(`SELECT ${field} AS v FROM wine_vintages WHERE id = $1`, [vintageId]);
  return r?.v ?? null;
}

async function resolveCritic(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const existing = await one<{ id: string }>(
    `SELECT id FROM critics
     WHERE lower(canonical_name) = lower($1)
        OR lower($1) = ANY(array(SELECT lower(unnest(aliases))))`,
    [n],
  );
  if (existing) return existing.id;
  const r = await one<{ id: string }>("INSERT INTO critics (canonical_name) VALUES ($1) RETURNING id", [n]);
  return r?.id ?? null;
}

async function resolveGrape(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const existing = await one<{ id: string }>(
    `SELECT id FROM grapes
     WHERE lower(canonical_name) = lower($1)
        OR lower($1) = ANY(array(SELECT lower(unnest(aliases))))`,
    [n],
  );
  if (existing) return existing.id;
  const r = await one<{ id: string }>("INSERT INTO grapes (canonical_name) VALUES ($1) RETURNING id", [n]);
  return r?.id ?? null;
}
