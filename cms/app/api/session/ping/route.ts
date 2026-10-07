// Lightweight ping used by SessionWatcher. Returns 200 for a valid session,
// 401 otherwise. Deliberately does not hit the DB — just verifies the cookie.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, role: user.role });
}
