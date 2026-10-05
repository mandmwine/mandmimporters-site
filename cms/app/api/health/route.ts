import { NextResponse } from "next/server";
import { dbConfigured, one } from "@/lib/db";
import { firebaseAdminConfigured } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// Reports setup status only (no data). Used to confirm configuration after deploy.
export async function GET() {
  const status: Record<string, string> = {
    firebaseWebConfig: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "set" : "missing",
    firebaseServiceAccount: firebaseAdminConfigured() ? "set" : "missing",
    database: dbConfigured() ? "configured" : "missing",
    bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_EMAIL ? "set" : "missing",
  };
  if (dbConfigured()) {
    try {
      const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM schema_migrations");
      status.database = `connected (${r?.n ?? 0} migrations applied)`;
    } catch (err) {
      status.database = "error: " + (err instanceof Error ? err.message.slice(0, 160) : "unknown");
    }
  }
  return NextResponse.json(status);
}
