// Applies migrations/*.sql in order, once each, inside a transaction.
// Runs automatically before every Vercel build. Skips cleanly when no database
// is configured yet so the app can still deploy.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, dbConfigured } from "./db-connect.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

if (!dbConfigured()) {
  console.log("[migrate] No database configured yet; skipping migrations.");
  process.exit(0);
}

const pool = await createPool(1);
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
  console.log("[migrate] database is up to date.");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  client.release();
  await pool.end();
}
