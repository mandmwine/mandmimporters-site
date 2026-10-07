import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import WineCsvImport from "@/components/WineCsvImport";

export const dynamic = "force-dynamic";

export default async function WineImportPage() {
  await requireEditor();
  return (
    <>
      <nav className="crumbs">
        <Link href="/wines">← Back to wines</Link>
      </nav>
      <header className="page-head">
        <h1>Import wines from CSV</h1>
        <p className="muted">
          Upload a CSV, preview the outcome, then run the import.
          Rows that already exist (matched on <strong>Producer + Wine + Vintage</strong>)
          are updated; new ones are created. Producers and wines are created
          automatically when the names don&rsquo;t yet exist.
        </p>
      </header>

      <WineCsvImport />

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Column reference</h2>
        <p className="small muted">
          Column names are case‑insensitive. Only Producer and Wine are
          required; everything else is optional and only writes a change when
          the CSV cell is non‑empty.
        </p>
        <table className="table compact">
          <thead>
            <tr><th>CSV header</th><th>Field</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Producer</td><td>producer</td><td><strong>Required.</strong> New ones are created with a lower-case slug.</td></tr>
            <tr><td>Wine</td><td>display_name</td><td><strong>Required.</strong></td></tr>
            <tr><td>Vintage</td><td>vintage_text</td><td>Blank = NV / unknown. The match key for existing rows.</td></tr>
            <tr><td>Category</td><td>category</td><td>red / white / rose / sparkling / dessert / fortified / orange / other.</td></tr>
            <tr><td>Mevushal</td><td>mevushal</td><td>yes / no — anything else becomes &ldquo;unknown.&rdquo;</td></tr>
            <tr><td>Supervision</td><td>supervision_display</td><td>Free text (e.g. &ldquo;OU; Badatz Beit Yosef&rdquo;).</td></tr>
            <tr><td>Aging</td><td>aging_display</td><td>Free text (e.g. &ldquo;18 months in French oak&rdquo;).</td></tr>
            <tr><td>Grapes</td><td>grapes</td><td>Comma or semicolon separated.</td></tr>
            <tr><td>Sizes</td><td>bottle_sizes</td><td>Comma or semicolon separated.</td></tr>
            <tr><td>Status</td><td>status</td><td>draft / needs_review / approved / published / discontinued.</td></tr>
            <tr><td>Tasting note</td><td>tasting_note</td><td></td></tr>
            <tr><td>Food pairing</td><td>food_pairing</td><td></td></tr>
            <tr><td>Short description</td><td>short_description</td><td></td></tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
