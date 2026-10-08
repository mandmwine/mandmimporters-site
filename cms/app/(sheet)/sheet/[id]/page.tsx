// Admin preview of the single-wine sheet. Lives in its own route group so the
// admin sidebar is NOT inherited — the live-preview iframe on the wine edit
// page embeds this URL and shows only the sheet.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadSheetData } from "@/lib/sheet/data";
import { SingleWineSheet } from "@/lib/sheet/SingleWineSheet";
import { captureError } from "@/lib/errors";
import "@/lib/sheet/sheet.css";

export const dynamic = "force-dynamic";

export default async function SheetPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; embed?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { mode, embed } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Phase 35 — any throw inside loadSheetData reaches /settings/system
  // with full context, and the iframe shows a readable placeholder
  // instead of blanking.
  let data: Awaited<ReturnType<typeof loadSheetData>> = null;
  try {
    data = await loadSheetData(id);
  } catch (err) {
    await captureError(err, {
      kind: "route",
      route: `/catalog-admin/sheet/${id}`,
      userId: user?.id ?? null,
      extra: { stage: "loadSheetData" },
    });
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "#1e1b18" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Couldn&rsquo;t render this sheet</h2>
        <p style={{ fontSize: 13, color: "#6f675d", margin: "6px 0 0" }}>
          The sheet renderer threw an error loading this wine. See{" "}
          <Link href="/settings/system">Settings &rarr; System</Link>.
        </p>
      </div>
    );
  }
  if (!data) notFound();

  // ?mode=raw hides the preview chrome so the printed/exported view matches exactly.
  if (mode === "raw") {
    return <SingleWineSheet data={data} mode="print" />;
  }

  // ?embed=1 (used by the live-preview iframe) hides the top bar but keeps the
  // screen rendering mode so links and tooltips still work.
  if (embed === "1") {
    return (
      <div className="sheet-preview sheet-preview--embed">
        <SingleWineSheet data={data} mode="screen" />
      </div>
    );
  }

  return (
    <div className="sheet-preview">
      <div className="sheet-preview__bar">
        <div className="group">
          <Link href={`/wines/${id}`}>← Back to wine</Link>
        </div>
        <div className="group">
          <span style={{ opacity: 0.6, marginRight: 8 }}>Export</span>
          <a href={`/catalog-admin/api/wines/${id}/pdf?preset=print`}>Print PDF</a>
          <a href={`/catalog-admin/api/wines/${id}/pdf?preset=email`}>Email PDF</a>
          <a href={`/catalog-admin/api/wines/${id}/pdf?preset=web`}>Web PDF</a>
          <a href={`/catalog-admin/sheet/${id}?mode=raw`} target="_blank" rel="noreferrer">Print view ↗</a>
        </div>
      </div>
      <SingleWineSheet data={data} mode="screen" />
    </div>
  );
}
