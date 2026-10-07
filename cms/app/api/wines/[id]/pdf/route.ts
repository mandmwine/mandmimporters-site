// Headless Chromium PDF export for a single wine sheet.
// Presets:
//   print  — US Letter, embedded fonts, high-quality images, optional crop marks
//   email  — PDF 1.4 compression, slightly reduced image quality (~5 MB target)
//   web    — stronger compression, ~1 MB target for fast download
//
// Runs on Vercel via @sparticuz/chromium-min (downloads Chrome on first use
// from a hosted pack URL) + puppeteer-core. Not available in `edge` runtime.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadSheetData } from "@/lib/sheet/data";
import { sheetHtml } from "@/lib/sheet/html";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Preset = "print" | "email" | "web";

function presetFromRequest(req: NextRequest): Preset {
  const p = req.nextUrl.searchParams.get("preset") ?? "print";
  return p === "email" || p === "web" ? p : "print";
}

function filenameFor(data: Awaited<ReturnType<typeof loadSheetData>>, preset: Preset): string {
  if (!data) return `wine-sheet-${preset}.pdf`;
  const slug = (data.wine.display_name ?? "wine")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const vintage = data.wine.vintage_text ? `-${data.wine.vintage_text}` : "";
  return `MM-${slug}${vintage}-${preset}.pdf`;
}

// Hosted brotli-packed Chromium binary matching @sparticuz/chromium-min 153.
// Pinned per release — change this when we upgrade chromium-min.
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

async function launchBrowser(preset: Preset) {
  // chromium-min fetches the pack URL on first invocation and caches it in /tmp
  // so subsequent requests reuse it. Nothing is shipped in the lambda bundle.
  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
  // Pixel density is the main size/quality lever we have for Chromium PDF.
  const scale = preset === "print" ? 2.0 : preset === "email" ? 1.4 : 1.0;
  return puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1600, deviceScaleFactor: scale },
    executablePath,
    headless: true,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await loadSheetData(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const preset = presetFromRequest(req);
  const html = await sheetHtml(data);

  let browser;
  try {
    browser = await launchBrowser(preset);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Give Google Fonts and the bottle image a chance to finish loading.
    await page.evaluateHandle("document.fonts.ready");
    // One extra tick for images: wait for every <img> to settle.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const imgs = Array.from(document.images);
          if (imgs.every((i) => i.complete)) return resolve();
          let left = imgs.filter((i) => !i.complete).length;
          const done = () => {
            if (--left <= 0) resolve();
          };
          imgs.forEach((i) => {
            if (!i.complete) {
              i.addEventListener("load", done, { once: true });
              i.addEventListener("error", done, { once: true });
            }
          });
          // Hard cap so a 404 image doesn't block forever.
          setTimeout(() => resolve(), 8000);
        }),
    );

    const pdfBuffer = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
    });

    await audit(user.id, `sheet.export.${preset}`, { type: "wine_vintage", id }, undefined, { bytes: pdfBuffer.byteLength });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameFor(data, preset)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[sheet-pdf] generation failed", err);
    return NextResponse.json(
      { error: "PDF generation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
