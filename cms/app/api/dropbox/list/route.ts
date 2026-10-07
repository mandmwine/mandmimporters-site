// Browse a Dropbox folder. Called by the client-side folder viewer to page
// through folders without reloading the whole page.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { dropboxConfigured, listFolder } from "@/lib/dropbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  if (!dropboxConfigured()) {
    return NextResponse.json({ error: "Dropbox not configured." }, { status: 503 });
  }
  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") ?? "";
  const cursor = sp.get("cursor") ?? undefined;
  try {
    const r = await listFolder(path, cursor);
    return NextResponse.json({
      path,
      entries: r.entries,
      cursor: r.cursor,
      has_more: r.has_more,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
