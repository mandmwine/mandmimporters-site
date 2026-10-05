// Admin preview of the single-wine sheet. Opens from the wine detail page
// in a new tab (user's request). Export buttons link to the PDF endpoint.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadSheetData } from "@/lib/sheet/data";
import { SingleWineSheet } from "@/lib/sheet/SingleWineSheet";
import "@/lib/sheet/sheet.css";

export const dynamic = "force-dynamic";

export default async function SheetPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { mode } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadSheetData(id);
  if (!data) notFound();

  // ?mode=raw hides the preview chrome so the printed/exported view matches exactly.
  if (mode === "raw") {
    return <SingleWineSheet data={data} mode="print" />;
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
