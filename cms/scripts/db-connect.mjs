// Shared Postgres connection setup for the migration runner and the app.
// Supports either a direct DATABASE_URL or a Cloud SQL instance reached through
// the Cloud SQL Node connector with the Firebase service account.
import pg from "pg";

export function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL || (process.env.CLOUD_SQL_INSTANCE && process.env.DB_USER));
}

export async function createPool(max = 5) {
  if (process.env.DATABASE_URL) {
    return new pg.Pool({ connectionString: process.env.DATABASE_URL, max });
  }
  const { Connector } = await import("@google-cloud/cloud-sql-connector");
  const sa = readServiceAccount();
  if (sa && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync("/tmp/catalog-gcp-sa.json", JSON.stringify(sa), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/catalog-gcp-sa.json";
  }
  const connector = new Connector();
  const iam = process.env.DB_AUTH === "IAM";
  const clientOpts = await connector.getOptions({
    instanceConnectionName: process.env.CLOUD_SQL_INSTANCE,
    ipType: "PUBLIC",
    ...(iam ? { authType: "IAM" } : {}),
  });
  return new pg.Pool({
    ...clientOpts,
    user: process.env.DB_USER,
    ...(iam ? {} : { password: process.env.DB_PASSWORD }),
    database: process.env.DB_NAME || "catalog",
    max,
  });
}
