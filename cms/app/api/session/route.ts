import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, firebaseAdminConfigured } from "@/lib/firebase-admin";
import { dbConfigured, one, query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { captureError } from "@/lib/errors";
import { BASE_PATH, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Phase 36 — richer denial responses so an admin who gets locked out
// can tell *why* instead of staring at the generic "no access" line.
// Each code maps to a clear plain-English message in the login form.
type DenyCode =
  | "server_not_configured"
  | "missing_token"
  | "token_unverifiable"
  | "sign_in_stale"
  | "unknown_email"
  | "account_inactive"
  | "bootstrap_blocked"
  | "server_error";

const deny = (code: DenyCode, message: string, status = 403, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, code, message, ...extra }, { status });

// Exchange a fresh Firebase ID token (from the login form) for an HTTP-only session cookie.
export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured() || !dbConfigured()) {
    return deny("server_not_configured", "The catalog system is not fully set up yet.", 503);
  }

  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return deny("missing_token", "Missing sign-in token.", 400);

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch (err) {
    await captureError(err, { kind: "route", route: "/api/session", extra: { stage: "verifyIdToken" } });
    return deny("token_unverifiable", "Sign-in could not be verified. Please try again.", 401);
  }
  // Only accept a sign-in that just happened.
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
    return deny("sign_in_stale", "Please sign in again — the Firebase sign-in you used is older than 5 minutes.", 401);
  }

  const email = (decoded.email ?? "").toLowerCase();
  let user: { id: string; active: boolean; firebase_uid: string | null } | null = null;
  try {
    user = await one<{ id: string; active: boolean; firebase_uid: string | null }>(
      "SELECT id, active, firebase_uid FROM users WHERE firebase_uid = $1 OR lower(email) = $2 ORDER BY (firebase_uid = $1) DESC NULLS LAST LIMIT 1",
      [decoded.uid, email],
    );
  } catch (err) {
    await captureError(err, { kind: "route", route: "/api/session", extra: { stage: "user_lookup", email } });
    return deny("server_error", "A database error prevented your sign-in. Check Settings → System once you can sign in.", 500);
  }

  // First-run bootstrap: the configured owner email becomes the first Admin.
  // Phase 36: also allow bootstrap when the users table has only inactive
  // entries OR when the owner's existing row has a mismatched firebase_uid
  // (common after rotating the Firebase project or changing primary email).
  let bootstrapAttempted = false;
  let bootstrapBlockedReason: string | null = null;
  if (!user || !user.active) {
    const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase().trim();
    if (bootstrap && email === bootstrap) {
      bootstrapAttempted = true;
      try {
        const count = await one<{ n: number; active_n: number }>(
          "SELECT count(*)::int AS n, count(*) FILTER (WHERE active)::int AS active_n FROM users",
        );
        // Original rule: empty users table → bootstrap the first admin.
        // Extended: also allow if there's an existing *inactive* row for the
        // bootstrap email (re-activate + rebind to the current firebase_uid).
        if (!user && (count?.n ?? 0) === 0) {
          user = await one(
            "INSERT INTO users (firebase_uid, email, display_name, role) VALUES ($1, $2, $3, 'admin') RETURNING id, active, firebase_uid",
            [decoded.uid, decoded.email, decoded.name ?? null],
          );
          await audit(user!.id, "user.bootstrap_admin", { type: "user", id: user!.id });
        } else if (user && !user.active) {
          // Owner's own row got deactivated. Re-activate it and audit.
          user = await one(
            "UPDATE users SET active = true, role = 'admin', firebase_uid = $1 WHERE id = $2 RETURNING id, active, firebase_uid",
            [decoded.uid, user.id],
          );
          await audit(user!.id, "user.bootstrap_reactivate", { type: "user", id: user!.id });
        } else {
          bootstrapBlockedReason = `Email matches BOOTSTRAP_ADMIN_EMAIL but the users table already has ${count?.n ?? 0} rows (${count?.active_n ?? 0} active) and no matching inactive row for you.`;
        }
      } catch (err) {
        await captureError(err, { kind: "route", route: "/api/session", extra: { stage: "bootstrap", email } });
      }
    }
  }

  if (!user || !user.active) {
    await audit(null, "auth.denied", undefined, undefined, { email, inactive_row_present: Boolean(user) });
    if (bootstrapAttempted) {
      return deny("bootstrap_blocked", bootstrapBlockedReason ?? "Bootstrap did not fit the current state. Contact an existing admin.", 403, { email });
    }
    if (user && !user.active) {
      return deny("account_inactive", `This account is disabled: ${email}. An admin must re-activate it on the Users page.`, 403, { email });
    }
    return deny(
      "unknown_email",
      `No catalog account is linked to ${email}. Ask an admin to add you under Settings → Users, or sign in with the email that's already registered.`,
      403,
      { email },
    );
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
