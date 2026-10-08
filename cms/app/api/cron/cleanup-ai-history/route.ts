// Phase 33 (Sprint 1) — AI history 60-day retention cron.
//
// Scheduled by vercel.json to run nightly at 03:17 UTC. Only authenticated
// Vercel cron invocations get through (Vercel sends `Authorization: Bearer
// <CRON_SECRET>` to any route under /api/cron/* when a crons entry targets
// it; we additionally check the header so a manual CURL without the secret
// is refused).
//
// What gets deleted:
//   - ai_actions rows older than 60 days with status in
//     ('rejected', 'failed', 'proposed')
//
// What is kept forever:
//   - ai_actions rows with status = 'accepted' — these are the provenance
//     of "AI did X and a human approved it on date Y".
//   - review_flags, field_provenance, catalog_versions, audits — all other
//     tables. This route only prunes AI proposal/action history, per the
//     final decisions §6.
//
// We also trim system_health_checks older than 60 days, since it's purely
// diagnostic. Each day of probes writes ~7 rows; a year of history is
// still only ~2500 rows, but there's no reason to keep it.

import { NextRequest, NextResponse } from "next/server";
import { query, dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse to run without a configured secret, so a forgotten env var
    // doesn't open the endpoint. The health check surfaces this as missing.
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 500 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const started = Date.now();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // AI history pruning. Keep accepted rows as provenance forever.
  const aiDeleted = await query<{ id: string }>(
    `DELETE FROM ai_actions
      WHERE created_at < $1
        AND status IN ('rejected', 'failed', 'proposed')
      RETURNING id`,
    [cutoff],
  );

  // Diagnostic probe log pruning. Harmless if the table is empty.
  const healthDeleted = await query<{ id: string }>(
    `DELETE FROM system_health_checks
      WHERE checked_at < $1
      RETURNING id`,
    [cutoff],
  );

  const durationMs = Date.now() - started;
  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    deleted: {
      ai_actions: aiDeleted.length,
      system_health_checks: healthDeleted.length,
    },
    duration_ms: durationMs,
  });
}
