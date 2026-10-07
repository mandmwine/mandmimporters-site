import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { importInventoryXlsx } from "@/lib/actions";
import XlsxImporter from "@/components/XlsxImporter";

export const dynamic = "force-dynamic";

export default async function InventoryImportPage() {
  await requireEditor();
  return (
    <>
      <nav className="crumbs">
        <Link href="/data">← Back to data hub</Link>
      </nav>
      <header className="page-head">
        <h1>Import inventory</h1>
        <p className="muted">
          Upload the monthly <strong>Inventory</strong> xlsx. Rows are matched
          on <strong>SKU</strong> first (Item Number column, e.g. <code>IT1709011321</code>),
          then on <strong>producer + wine + vintage</strong> as a fallback.
          Stock cases on-hand / allocated / available / inbound are updated;
          the pack size is pulled from the UoM column.
        </p>
      </header>
      <XlsxImporter action={importInventoryXlsx} kind="inventory" />
    </>
  );
}
