// Mass PDF export for an entire catalog composition.
// Flow:
//   1. Load the catalog composition (sections + items + wine data).
//   2. Create a catalog_versions snapshot of the exact state used.
//   3. Build a single multi-page HTML document.
//   4. Render it with headless Chromium (puppeteer-core + @sparticuz/chromium).
//   5. Stream the resulting PDF back to the browser as an attachment.
//   6. Record an export_files row + asset for history.
//
// This is sync for now (keeps the request alive until the PDF is ready).
// For catalogs >60 pages the maxDuration below may need to grow or move to
// a worker, but we start simple.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { one, query } from "@/lib/db";
import { captureError } from "@/lib/errors";
import { buildCatalogPlan, catalogHtml, type Preset } from "@/lib/sheet/catalog-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function presetFromRequest(req: NextRequest): Preset {
  const p = req.nextUrl.searchParams.get("preset") ?? "print";
  return p === "email" || p === "web" ? p : "print";
}

function fileSafe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

// Per-preset Chromium settings. The main lever we have for file size is the
// deviceScaleFactor during rasterization: a 2× viewport doubles raster pixel
// density, which keeps bitmaps sharp when printed but inflates PDF size. Web
// uses 1× for the smallest file; email a middle ground; print the highest.
const PRESET_SETTINGS: Record<Preset, { scale: number; margin: string }> = {
  print: { scale: 2.0, margin: "0in" },
  email: { scale: 1.4, margin: "0in" },
  web: { scale: 1.0, margin: "0in" },
};

// Hosted brotli-packed Chromium binary matching @sparticuz/chromium-min 153.
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const preset = presetFromRequest(req);

  // Phase 35 — top-level try wraps the whole flow (plan build, HTML build,
  // Chromium render, DB updates) so an exception anywhere lands on
  // /settings/system via captureError AND returns a readable 500 JSON body
  // instead of Chrome's blank "HTTP ERROR 500" page.
  try {
    const plan = await buildCatalogPlan(id);
    if (!plan) return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    if (plan.items.length === 0) {
      return NextResponse.json({ error: "Catalog has no wines yet" }, { status: 400 });
    }

    // Snapshot — small summary stored on catalog_versions.snapshot. The full data
    // isn't persisted yet (that'd want blob storage); the snapshot records the
    // composition so we can reproduce it as long as the wine records exist.
    const snapshot = {
      name: plan.catalog.name,
      season: plan.catalog.season,
      render_mode: plan.catalog.render_mode,
      sections: plan.sections.map((s) => ({ id: s.id, kind: s.kind, title: s.title, settings: s.settings })),
      items: plan.items.map((i) => ({ id: i.id, section_id: i.section_id, wine_vintage_id: i.wine_vintage_id, position: i.position })),
      exported_by: user.id,
      exported_at: new Date().toISOString(),
      preset,
    };

    // Version label: catalog-local counter so re-exports are easy to tell apart.
    const prior = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM catalog_versions WHERE catalog_id = $1",
      [id],
    );
    const versionLabel = `v${(prior?.n ?? 0) + 1} ${preset}`;
    const version = await one<{ id: string }>(
      `INSERT INTO catalog_versions (catalog_id, version_label, template_version, snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, versionLabel, "wine-sheet-v3", snapshot, user.id],
    );
    const exportFile = await one<{ id: string }>(
      `INSERT INTO export_files (catalog_version_id, preset, status, created_by)
       VALUES ($1, $2, 'rendering', $3) RETURNING id`,
      [version!.id, preset, user.id],
    );

    // Phase 35 — buildCatalogPlan loaded; now the HTML build. Isolate it so
    // a renderer exception (bad SheetData shape, missing map, broken image)
    // surfaces with the exact stage in the captured error.
    let html: string;
    try {
      html = await catalogHtml(plan, preset);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await captureError(err, {
        kind: "export",
        route: `/catalog-admin/api/catalogs/${id}/export`,
        userId: user.id,
        extra: { stage: "catalogHtml", preset, wine_count: plan.items.length },
      });
      await query(
        `UPDATE export_files SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
        [exportFile!.id, msg.slice(0, 500)],
      );
      return NextResponse.json(
        {
          error: "Catalog HTML build failed",
          detail: msg,
          stage: "catalogHtml",
          wine_count: plan.items.length,
          hint: "See Settings → System for the full stack. A single bad wine often breaks the whole build; try exporting a smaller section to isolate.",
        },
        { status: 500 },
      );
    }

    let browser;
    try {
      browser = await launchBrowser(preset);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
      await page.evaluateHandle("document.fonts.ready");
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
            setTimeout(() => resolve(), 15_000);
          }),
      );

      const pdfBuffer = await page.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
      });

      const bytes = pdfBuffer.byteLength;
      await query(
        `UPDATE export_files SET status = 'done', completed_at = now() WHERE id = $1`,
        [exportFile!.id],
      );
      await audit(user.id, `catalog.export.${preset}`, { type: "catalog", id }, undefined, { bytes, version: versionLabel });

      const filename = fileSafe(`MM-${plan.catalog.name}-${versionLabel}.pdf`);
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Catalog-Version": versionLabel,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[catalog-pdf] generation failed", msg);
      await captureError(err, {
        kind: "export",
        route: `/catalog-admin/api/catalogs/${id}/export`,
        userId: user.id,
        extra: { stage: "chromium_render", preset, wine_count: plan.items.length },
      });
      await query(
        `UPDATE export_files SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
        [exportFile!.id, msg.slice(0, 500)],
      );
      return NextResponse.json(
        {
          error: "PDF generation failed",
          detail: msg,
          stage: "chromium_render",
          hint: "The HTML built OK; Chromium failed. Likely causes: hosted Chromium binary unreachable, memory limit, a resource timed out.",
        },
        { status: 500 },
      );
    } finally {
      await browser?.close().catch(() => {});
    }
  } catch (err) {
    // Phase 35 — catches everything upstream of the HTML build:
    // buildCatalogPlan, DB inserts for the catalog_version / export_files,
    // bad id, etc. Returns a readable 500 body instead of Chrome's blank
    // "HTTP ERROR 500" page.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : null;
    await captureError(err, {
      kind: "export",
      route: `/catalog-admin/api/catalogs/${id}/export`,
      userId: user.id,
      extra: { stage: "preflight_or_plan", preset },
    });
    return NextResponse.json(
      {
        error: "Catalog export failed before HTML build",
        detail: msg,
        stack: user.role === "admin" ? stack : undefined,
        stage: "preflight_or_plan",
        hint: "See Settings → System for the full history. If the error mentions a column, run `npm run migrate` on this environment.",
      },
      { status: 500 },
    );
  }
}
