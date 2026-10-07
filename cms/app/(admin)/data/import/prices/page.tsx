import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { importPricesXlsx } from "@/lib/actions";
import XlsxImporter from "@/components/XlsxImporter";

export const dynamic = "force-dynamic";

export default async function PricesImportPage() {
  await requireEditor();
  return (
    <>
      <nav className="crumbs">
        <Link href="/data">← Back to data hub</Link>
      </nav>
      <header className="page-head">
        <h1>Import prices</h1>
        <p className="muted">
          Upload the monthly <strong>Price Posting</strong> xlsx. For each matched
          vintage we write the full ladder: FrontLine (list) plus any of
          2cs / 3cs / 4cs / 5cs / 10cs / 25cs that have a non-zero case price.
          A blank or zero cell removes that tier for the vintage.
        </p>
      </header>
      <XlsxImporter action={importPricesXlsx} kind="prices" />
    </>
  );
}
