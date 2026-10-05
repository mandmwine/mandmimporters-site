import { requireUser, roleLabel } from "@/lib/auth";
import Nav from "@/components/Nav";
import SignOut from "@/components/SignOut";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
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
  );
}
