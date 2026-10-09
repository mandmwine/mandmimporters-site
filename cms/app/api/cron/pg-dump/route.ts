// Phase 49 (final-decisions §18) — Independent nightly database export.
//
// What this is:
//   A row-level CSV export of every public-schema table (excluding
//   schema_migrations), uploaded to the GCS bucket named by
//   BACKUP_BUCKET (defaulting to the main Firebase bucket when unset).
//   Each table lands at
//     backups/<timestamp>/<table>.csv
//   with a header row. The run is recorded in the backup_runs table.
//
// What this isn't:
//   A full pg_dump. Vercel's serverless Node runtime doesn't ship the
//   pg_dump binary, and shelling out to it would need a separate Cloud
//   Run job. For disaster recovery the real plan is Cloud SQL's own
//   managed backups + point-in-time recovery; this independent export
//   is the belt that goes with those suspenders — a human-readable
//   snapshot of row data that can be inspected or imported anywhere
//   Postgres runs.
//
// Scheduling:
//   vercel.json runs this nightly at 03:47 UTC (half an hour after the
//   AI cleanup cron so the two don't collide on the DB).
//
// Auth:
//   Same CRON_SECRET bearer check as /api/cron/cleanup-ai-history.
//
// Required env vars:
//   CRON_SECRET
//   BACKUP_BUCKET  (optional — falls back to NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
import { NextRequest, NextResponse } from "next/server";
import { getPool, query, dbConfigured } from "@/lib/db";
import { captureError } from "@/lib/errors";
import { getStorage } from "firebase-admin/storage";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // five minutes; row volumes here are small.

const EXCLUDE_TABLES = new Set([
  "schema_migrations", // tracks what the migrator has applied; not data.
]);

function bucket() {
  adminAuth(); // ensures firebase-admin is initialised
  const name = process.env.BACKUP_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) throw new Error("Neither BACKUP_BUCKET nor NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is set.");
  return getStorage().bucket(name);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 500 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const started = new Date();
  const ts = started.toISOString().replace(/[:.]/g, "-");

  // Record an in-progress row first; the completion update tags status+bytes.
  const run = await one<{ id: string }>(
    `INSERT INTO backup_runs (backup_type, status, started_at)
     VALUES ('pg_dump', 'running', $1) RETURNING id`,
    [started],
  );
  if (!run) {
    return NextResponse.json({ ok: false, error: "Could not record backup run." }, { status: 500 });
  }

  try {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    const live = tables.map((t) => t.table_name).filter((t) => !EXCLUDE_TABLES.has(t));
    if (live.length === 0) {
      await query("UPDATE backup_runs SET status='failed', completed_at=now(), error_message=$2 WHERE id=$1",
        [run.id, "No tables to export."]);
      return NextResponse.json({ ok: false, error: "No tables to export." }, { status: 500 });
    }

    const b = bucket();
    const pool = await getPool();
    // pg-copy-streams would be the clean path but we only need the plain
    // query-and-stringify route for the row counts in this product; a few
    // thousand rows per table is well within the serverless memory budget.
    let totalBytes = 0;
    const perTable: { table: string; bytes: number; rows: number }[] = [];
    for (const t of live) {
      const client = await pool.connect();
      try {
        const res = await client.query(`SELECT * FROM "${t}"`);
        const cols = res.fields.map((f) => f.name);
        const headerLine = cols.map(csvEscape).join(",");
        const bodyLines = res.rows.map((row) => cols.map((c) => csvEscape(row[c])).join(","));
        const csv = [headerLine, ...bodyLines, ""].join("\n");
        const data = Buffer.from(csv, "utf8");
        const path = `backups/${ts}/${t}.csv`;
        await b.file(path).save(data, {
          contentType: "text/csv",
          resumable: false,
          metadata: {
            metadata: { source: "cron/pg-dump", table: t, row_count: String(res.rowCount ?? 0) },
          },
        });
        totalBytes += data.byteLength;
        perTable.push({ table: t, bytes: data.byteLength, rows: res.rowCount ?? 0 });
      } finally {
        client.release();
      }
    }

    const objectPath = `backups/${ts}/`;
    await query(
      `UPDATE backup_runs
         SET status = 'succeeded', object_path = $2, bytes = $3, completed_at = now()
       WHERE id = $1`,
      [run.id, objectPath, totalBytes],
    );
    return NextResponse.json({
      ok: true,
      object_path: objectPath,
      total_bytes: totalBytes,
      tables: perTable.length,
      per_table: perTable,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await captureError(err, { kind: "cron", route: "/api/cron/pg-dump" });
    await query(
      "UPDATE backup_runs SET status='failed', completed_at=now(), error_message=$2 WHERE id=$1",
      [run.id, msg.slice(0, 500)],
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Minimal single-row read of a single column, to keep the route
// self-contained without importing from lib/db's internal helpers.
async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// RFC-4180 CSV escaping: quote wraps anything with a comma, newline, or
// quote; embedded quotes doubled; null → empty.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
