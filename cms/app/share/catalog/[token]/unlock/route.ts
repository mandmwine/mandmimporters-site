// Phase 16: POST handler that verifies the passphrase and sets the unlock
// cookie before redirecting back to the public share page.
import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { unlockCookieName, unlockCookieValue, verifySharePassword } from "@/lib/sharePassword";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const share = await one<{ id: string; password_hash: string | null; revoked_at: Date | null; expires_at: Date | null }>(
    "SELECT id, password_hash, revoked_at, expires_at FROM catalog_shares WHERE token = $1",
    [token],
  );
  if (!share || share.revoked_at || (share.expires_at && new Date(share.expires_at).getTime() < Date.now())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!share.password_hash) {
    // No password set — nothing to unlock. Send the viewer straight to the catalog.
    return NextResponse.redirect(new URL(`/catalog-admin/share/catalog/${token}`, req.url), 303);
  }
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!verifySharePassword(password, share.password_hash)) {
    return NextResponse.redirect(
      new URL(`/catalog-admin/share/catalog/${token}?error=wrong`, req.url),
      303,
    );
  }
  const res = NextResponse.redirect(new URL(`/catalog-admin/share/catalog/${token}`, req.url), 303);
  res.cookies.set({
    name: unlockCookieName(token),
    value: unlockCookieValue(token, share.password_hash),
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: `/catalog-admin/share/catalog/${token}`,
    maxAge: 60 * 60 * 24 * 30,  // 30 days
  });
  return res;
}
