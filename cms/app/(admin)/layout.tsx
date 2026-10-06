import { requireUser, roleLabel } from "@/lib/auth";
import { query } from "@/lib/db";
import Nav from "@/components/Nav";
import SignOut from "@/components/SignOut";
import { SelectionProvider } from "@/components/SelectionProvider";
import SelectionBar from "@/components/SelectionBar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Pulled once for the sticky selection bar so Add-to-existing is instant.
  const catalogs = await query<{ id: string; name: string }>(
    "SELECT id, name FROM catalogs WHERE status = 'working' ORDER BY updated_at DESC LIMIT 50",
  );
  return (
    <SelectionProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="eyebrow">M &amp; M Importers</span>
            <strong>Catalog</strong>
          </div>
          <Nav isAdmin={user.role === "admin"} />
          <div className="me">
            <div>{user.displayName || user.email}</div>
            <div className="muted small">{roleLabel(user.role)}</div>
            <SignOut />
          </div>
        </aside>
        <main className="content">{children}</main>
      </div>
      <SelectionBar existingCatalogs={catalogs} />
    </SelectionProvider>
  );
}
