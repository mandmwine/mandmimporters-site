import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, firebaseAdminConfigured } from "@/lib/firebase-admin";
import { dbConfigured, one, query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { BASE_PATH, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

export const dynamic = "force-dynamic";

const deny = (message: string, status = 403) => NextResponse.json({ ok: false, message }, { status });

// Exchange a fresh Firebase ID token (from the login form) for an HTTP-only session cookie.
export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured() || !dbConfigured()) return deny("The catalog system is not fully set up yet.", 503);

  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return deny("Missing sign-in token.", 400);

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    return deny("Sign-in could not be verified. Please try again.", 401);
  }
  // Only accept a sign-in that just happened.
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return deny("Please sign in again.", 401);

  const email = (decoded.email ?? "").toLowerCase();
  let user = await one<{ id: string; active: boolean; firebase_uid: string | null }>(
    "SELECT id, active, firebase_uid FROM users WHERE firebase_uid = $1 OR lower(email) = $2 ORDER BY (firebase_uid = $1) DESC NULLS LAST LIMIT 1",
    [decoded.uid, email],
  );

  // First-run bootstrap: the configured owner email becomes the first Admin.
  if (!user) {
    const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase().trim();
    const count = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
    if (bootstrap && email === bootstrap && count?.n === 0 && decoded.email_verified !== false) {
      user = await one(
        "INSERT INTO users (firebase_uid, email, display_name, role) VALUES ($1, $2, $3, 'admin') RETURNING id, active, firebase_uid",
        [decoded.uid, decoded.email, decoded.name ?? null],
      );
      await audit(user!.id, "user.bootstrap_admin", { type: "user", id: user!.id });
    }
  }

  if (!user || !user.active) {
    await audit(null, "auth.denied", undefined, undefined, { email });
    return deny("This account does not have access to the catalog system.");
  }

  await query("UPDATE users SET firebase_uid = $1, last_login_at = now(), updated_at = now() WHERE id = $2", [
    decoded.uid,
    user.id,
  ]);

  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  await audit(user.id, "auth.login", { type: "user", id: user.id });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: BASE_PATH,
    maxAge: expiresIn / 1000,
  });
  return res;
}

// Sign out: clear the cookie and revoke the Firebase session everywhere.
export async function DELETE(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && firebaseAdminConfigured()) {
    try {
      const decoded = await adminAuth().verifySessionCookie(cookie);
      await adminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      /* already invalid */
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: BASE_PATH, maxAge: 0 });
  return res;
}
