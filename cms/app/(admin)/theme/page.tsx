import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import ThemeTokensEditor from "@/components/ThemeTokensEditor";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  scope_type: "global" | "category" | "region";
  scope_key: string;
  tokens: Record<string, string>;
  updated_at: Date;
  updated_by_email: string | null;
};

export default async function ThemePage() {
  const user = await getSessionUser();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const rows = await query<Row>(
    `SELECT t.id, t.scope_type, t.scope_key, t.tokens, t.updated_at, u.email AS updated_by_email
       FROM theme_tokens t LEFT JOIN users u ON u.id = t.updated_by
       ORDER BY t.scope_type, t.scope_key`,
  );

  return (
    <>
      <header className="page-head">
        <h1>Theme tokens</h1>
        <p className="muted">
          Named colors and typographic values used by the sheet renderer. Scoped globally,
          by wine category (<Link href="/wines">red / white / rosé / sparkling…</Link>), or
          by region. The <strong>category</strong> and <strong>region</strong> scopes override
          the <strong>global</strong> scope for wines that fall under them.
        </p>
      </header>

      <section className="theme-list">
        {rows.map((r) => (
          <ThemeTokensEditor key={r.id} row={r} canEdit={canEdit} />
        ))}
        {canEdit && <ThemeTokensEditor row={null} canEdit={canEdit} />}
      </section>
    </>
  );
}
