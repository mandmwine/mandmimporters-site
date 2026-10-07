// Phase 16: buyer-builds-their-own PDF on a shared catalog.
// Unlike /api/catalogs/<id>/export (admin-only), this endpoint is gated by
// the opaque share token + optional unlock cookie — the same gate the shared
// view page uses. The response is streamed back as an attachment.
//
// Catalog settings (show_prices, price_tier, show_stock) are honored exactly
// as they are in the admin PDF; a shared Trade catalog downloads with its
// price ladder, a shared retail catalog downloads without.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { one, query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { buildCatalogPlan, catalogHtml, type Preset } from "@/lib/sheet/catalog-html";
import { unlockCookieName, unlockCookieValue } from "@/lib/sharePassword";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PRESET_SETTINGS: Record<Preset, { scale: number }> = {
  print: { scale: 2.0 },
  email: { scale: 1.4 },
  web: { scale: 1.0 },
};

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

async function launchBrowser(preset: Preset) {
  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  return puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1600, deviceScaleFactor: PRESET_SETTINGS[preset].scale },
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });
}

function presetFromRequest(req: NextRequest): Preset {
  const p = req.nextUrl.searchParams.get("preset") ?? "email";
  return p === "print" || p === "web" ? p : "email";
}

function fileSafe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const share = await one<{ id: string; catalog_id: string; password_hash: string | null; revoked_at: Date | null; expires_at: Date | null; recipient_email: string | null }>(
    "SELECT id, catalog_id, password_hash, revoked_at, expires_at, recipient_email FROM catalog_shares WHERE token = $1",
    [token],
  );
  if (!share || share.revoked_at || (share.expires_at && new Date(share.expires_at).getTime() < Date.now())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (share.password_hash) {
    const cookieStore = await cookies();
    const expected = unlockCookieValue(token, share.password_hash);
    const got = cookieStore.get(unlockCookieName(token))?.value ?? "";
    if (got !== expected) {
      return NextResponse.redirect(new URL(`/catalog-admin/share/catalog/${token}`, req.url), 303);
    }
  }

  const preset = presetFromRequest(req);
  const plan = await buildCatalogPlan(share.catalog_id);
  if (!plan) return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  if (plan.items.length === 0) {
    return NextResponse.json({ error: "Catalog has no wines yet" }, { status: 400 });
  }

  const html = await catalogHtml(plan, preset);

  let browser;
  try {
    browser = await launchBrowser(preset);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluateHandle("document.fonts.ready");
    await page.evaluate(() => new Promise<void>((resolve) => {
      const imgs = Array.from(document.images);
      if (imgs.every((i) => i.complete)) return resolve();
      let left = imgs.filter((i) => !i.complete).length;
      const done = () => { if (--left <= 0) resolve(); };
      imgs.forEach((i) => {
        if (!i.complete) {
          i.addEventListener("load", done, { once: true });
          i.addEventListener("error", done, { once: true });
        }
      });
      setTimeout(() => resolve(), 15_000);
    }));
    const pdfBuffer = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
    });

    // Track that this recipient downloaded a PDF — it's a stronger signal
    // than a page view, worth its own audit entry.
    await query(
      "UPDATE catalog_shares SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1",
      [share.id],
    );
    await audit(null, `catalog.share.pdf.${preset}`, { type: "catalog_share", id: share.id }, undefined, {
      recipient_email: share.recipient_email,
      bytes: pdfBuffer.byteLength,
    });

    const filename = fileSafe(`MM-${plan.catalog.name}-${preset}.pdf`);
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[share-pdf] generation failed", msg);
    return NextResponse.json({ error: "PDF generation failed", detail: msg }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
