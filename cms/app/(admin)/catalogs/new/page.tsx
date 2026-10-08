// Phase D — New-catalog wizard, step 2+3 of the audit's five-step flow.
//
// Step 1 (pick wines) happens on /wines via the Selection Provider; the user
// arrives here with wines already ticked (or none, in which case we tell them
// to go pick some first).
//
// This page is just a server shell that loads the selection snapshot and
// hands it to the client wizard component.
import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { query } from "@/lib/db";
import NewCatalogWizard from "@/components/NewCatalogWizard";

export const dynamic = "force-dynamic";

export default async function NewCatalogPage() {
  await requireEditor();
  // Load the handful of existing catalogs so the wizard can offer "add to
  // existing" as an alternative to creating a brand-new one.
  const existing = await query<{ id: string; name: string; season: string | null }>(
    "SELECT id, name, season FROM catalogs WHERE status = 'working' ORDER BY updated_at DESC LIMIT 20",
  );
  return (
    <>
      <p className="crumbs">
        <Link href="/catalogs">Catalogs</Link> / New
      </p>
      <header className="page-head">
        <h1>Create a catalog</h1>
        <p className="muted">
          Pick a presentation, name it, and we'll scaffold the sections. You can
          rearrange everything on the next screen.
        </p>
      </header>
      <NewCatalogWizard existingCatalogs={existing} />
    </>
  );
}
