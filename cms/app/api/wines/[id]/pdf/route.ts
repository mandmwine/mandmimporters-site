// Headless Chromium PDF export for a single wine sheet.
// Presets:
//   print  — US Letter, embedded fonts, high-quality images, optional crop marks
//   email  — PDF 1.4 compression, slightly reduced image quality (~5 MB target)
//   web    — stronger compression, ~1 MB target for fast download
//
// Runs on Vercel via @sparticuz/chromium (brotli-compressed Chrome in /tmp) and
// puppeteer-core. Not available in `edge` runtime.
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

async function launchBrowser() {
  // Vercel's Node runtime has no Chrome. @sparticuz/chromium provides a small build
  // that unpacks into /tmp on first use.
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = await chromium.executablePath();
  return puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1600, deviceScaleFactor: 2 },
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
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    // Give Google Fonts and the bottle image a chance to finish loading.
    await page.evaluateHandle("document.fonts.ready");

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
