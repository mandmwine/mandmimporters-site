"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireEditor, type Role } from "./auth";
import { one, query } from "./db";
import { audit } from "./audit";
import { adminAuth } from "./firebase-admin";

// ---------------------------------------------------------------- review flags
export async function setFlagStatus(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["resolved", "dismissed", "open"].includes(status)) return;
  const before = await one<{ status: string }>("SELECT status FROM review_flags WHERE id = $1", [id]);
  if (!before) return;
  await query(
    `UPDATE review_flags SET status = $2,
       resolved_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3::uuid END,
       resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
     WHERE id = $1`,
    [id, status, user.id],
  );
  await audit(user.id, `flag.${status}`, { type: "review_flag", id }, { old: before.status, new: status });
  revalidatePath("/review");
  revalidatePath("/wines", "layout");
}

// ---------------------------------------------------------------- users (Admin only)
export type UserActionResult = { ok: boolean; message: string; link?: string };

export async function createUser(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "editor") as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!["admin", "editor"].includes(role)) return { ok: false, message: "Choose Admin or Editor." };
  if (await one("SELECT 1 FROM users WHERE lower(email) = $1", [email])) {
    return { ok: false, message: "That email already has an account." };
  }

  const auth = adminAuth();
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await auth.createUser({ email, displayName: displayName ?? undefined, emailVerified: false })).uid;
  }
  const row = await one<{ id: string }>(
    "INSERT INTO users (firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id",
    [uid, email, displayName, role],
  );
  await audit(admin.id, "user.create", { type: "user", id: row!.id }, { new: { email, role } });

  // A one-time link the new user opens to choose their own password.
  const link = await auth.generatePasswordResetLink(email);
  revalidatePath("/users");
  return {
    ok: true,
    message: `Account created for ${email}. Send them this link to set their password (it expires after one use or about an hour):`,
    link,
  };
}

export async function resetLink(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const u = await one<{ email: string }>("SELECT email FROM users WHERE id = $1", [id]);
  if (!u) return { ok: false, message: "User not found." };
  const link = await adminAuth().generatePasswordResetLink(u.email);
  await audit(admin.id, "user.password_reset_link", { type: "user", id });
  return { ok: true, message: `Password link for ${u.email}:`, link };
}

export async function updateUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = formData.get("role") ? (String(formData.get("role")) as Role) : null;
  const active = formData.get("active") !== null ? formData.get("active") === "true" : null;
  const u = await one<{ id: string; role: Role; active: boolean; firebase_uid: string | null }>(
    "SELECT id, role, active, firebase_uid FROM users WHERE id = $1",
    [id],
  );
  if (!u) return;

  const losingAdmin = u.role === "admin" && ((role && role !== "admin") || active === false);
  if (losingAdmin) {
    const admins = await one<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
    if ((admins?.n ?? 0) <= 1) return; // never remove the last active Admin
  }
  if (id === admin.id && (active === false || (role && role !== "admin"))) return; // can't lock yourself out

  if (role && ["admin", "editor"].includes(role) && role !== u.role) {
    await query("UPDATE users SET role = $2, updated_at = now() WHERE id = $1", [id, role]);
    await audit(admin.id, "user.role", { type: "user", id, field: "role" }, { old: u.role, new: role });
  }
  if (active !== null && active !== u.active) {
    await query("UPDATE users SET active = $2, updated_at = now() WHERE id = $1", [id, active]);
    if (u.firebase_uid) {
      await adminAuth().updateUser(u.firebase_uid, { disabled: !active });
      if (!active) await adminAuth().revokeRefreshTokens(u.firebase_uid);
    }
    await audit(admin.id, active ? "user.reactivate" : "user.deactivate", { type: "user", id, field: "active" }, { old: u.active, new: active });
  }
  revalidatePath("/users");
}
