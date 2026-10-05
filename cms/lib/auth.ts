import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, firebaseAdminConfigured } from "./firebase-admin";
import { dbConfigured, one } from "./db";

export const SESSION_COOKIE = "__session";
export const SESSION_DAYS = 5;
export const BASE_PATH = "/catalog-admin";

export type Role = "admin" | "editor" | "viewer";
export type SessionUser = { id: string; email: string; displayName: string | null; role: Role };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!firebaseAdminConfigured() || !dbConfigured()) return null;
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const user = await one<{ id: string; email: string; display_name: string | null; role: Role; active: boolean }>(
      "SELECT id, email, display_name, role, active FROM users WHERE firebase_uid = $1",
      [decoded.uid],
    );
    if (!user || !user.active) return null;
    return { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "editor") redirect("/");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export function roleLabel(role: Role): string {
  return role === "admin" ? "Admin" : role === "editor" ? "Editor" : "View only";
}
