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

async function createPool(): Promise<Pool> {
  if (process.env.DATABASE_URL) {
    return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  const { Connector, AuthTypes, IpAddressTypes } = await import("@google-cloud/cloud-sql-connector");
  await useServiceAccountForGoogleCloud();
  const connector = new Connector();
  const iam = process.env.DB_AUTH === "IAM";
  const clientOpts = await connector.getOptions({
    instanceConnectionName: process.env.CLOUD_SQL_INSTANCE as string,
    ipType: IpAddressTypes.PUBLIC,
    ...(iam ? { authType: AuthTypes.IAM } : {}),
  });
  return new pg.Pool({
    ...clientOpts,
    user: process.env.DB_USER,
    ...(iam ? {} : { password: process.env.DB_PASSWORD }),
    database: process.env.DB_NAME || "catalog",
    max: 5,
  });
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
  const res = await pool.query<T>(text, params as unknown[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
