import pg from "pg";
import type { Pool, QueryResultRow } from "pg";

// pg returns NUMERIC as string by default; keep that (exact values), but parse int8 counts.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

declare global {
  // eslint-disable-next-line no-var
  var __catalogPool: Promise<Pool> | undefined;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || (process.env.CLOUD_SQL_INSTANCE && process.env.DB_USER));
}

function readServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

// The connector authenticates with Application Default Credentials. On Vercel there is
// no credentials file, so write the service account to /tmp and point ADC at it.
async function useServiceAccountForGoogleCloud() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const sa = readServiceAccount();
  if (!sa) return;
  const { writeFile } = await import("node:fs/promises");
  const file = "/tmp/catalog-gcp-sa.json";
  await writeFile(file, JSON.stringify(sa), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
}

type ConnectorMod = {
  Connector: new (opts?: unknown) => { getOptions: (o: Record<string, unknown>) => Promise<Record<string, unknown>> };
};

async function buildPoolConfig(database: string, max: number): Promise<pg.PoolConfig> {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, max };
  }
  const mod = (await import("@google-cloud/cloud-sql-connector")) as ConnectorMod;
  await useServiceAccountForGoogleCloud();
  const connector = new mod.Connector();
  const iam = process.env.DB_AUTH === "IAM";
  const clientOpts = (await connector.getOptions({
    instanceConnectionName: process.env.CLOUD_SQL_INSTANCE as string,
    ipType: "PUBLIC",
    ...(iam ? { authType: "IAM" } : {}),
  })) as pg.PoolConfig;
  return {
    ...clientOpts,
    user: process.env.DB_USER,
    ...(iam ? {} : { password: process.env.DB_PASSWORD }),
    database,
    max,
  };
}

// Firebase SQL Connect provisions the Cloud SQL instance but doesn't create the
// application database. Connect to the default `postgres` database the first
// time we come up and CREATE DATABASE <target> if it isn't there yet.
async function ensureDatabaseExists(target: string): Promise<void> {
  const bootstrapPool = new pg.Pool(await buildPoolConfig("postgres", 1));
  try {
    const existing = await bootstrapPool.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname = $1", [target]);
    if (existing.rows.length === 0) {
      console.log(`[db] creating database "${target}"`);
      // CREATE DATABASE can't run in a transaction and doesn't take parameters, so quote-identify it.
      await bootstrapPool.query(`CREATE DATABASE "${target.replace(/"/g, '""')}"`);
    }
  } finally {
    await bootstrapPool.end();
  }
}

async function createPool(): Promise<Pool> {
  const target = process.env.DB_NAME || "catalog";
  if (!process.env.DATABASE_URL) {
    try {
      await ensureDatabaseExists(target);
    } catch (err) {
      // If the target database already exists this still works; log and continue
      // on anything else so one bad bootstrap doesn't take down the whole app.
      console.error(`[db] bootstrap check failed, continuing: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return new pg.Pool(await buildPoolConfig(target, 5));
}

// Run pending SQL migrations exactly once per process, inside an advisory lock.
// Called lazily at first database access so a cold start applies new migrations
// without needing a build-time connection to the database.
let migrationsPromise: Promise<void> | null = null;
async function ensureMigrations(pool: Pool): Promise<void> {
  if (migrationsPromise) return migrationsPromise;
  migrationsPromise = (async () => {
    const path = await import("node:path");
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = path.join(process.cwd(), "migrations");
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(727274)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const done = new Set(
        (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
      );
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
          throw err;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
      client.release();
    }
  })().catch((err) => {
    migrationsPromise = null; // allow retry on the next request
    throw err;
  });
  return migrationsPromise;
}

export function getPool(): Promise<Pool> {
  if (!dbConfigured()) throw new Error("Database is not configured yet.");
  if (!globalThis.__catalogPool) {
    globalThis.__catalogPool = createPool().catch((err) => {
      globalThis.__catalogPool = undefined;
      throw err;
    });
  }
  return globalThis.__catalogPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = await getPool();
  await ensureMigrations(pool);
  const res = await pool.query<T>(text, params as unknown[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
