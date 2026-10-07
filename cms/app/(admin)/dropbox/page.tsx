import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dropboxConfigured, whoAmI } from "@/lib/dropbox";
import DropboxBrowser from "@/components/DropboxBrowser";

export const dynamic = "force-dynamic";

export default async function DropboxPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; kind?: string }>;
}) {
  const user = await requireUser();
  const canEdit = user.role === "admin" || user.role === "editor";
  const sp = await searchParams;
  const startPath = sp.path ?? "";
  const kind = sp.kind ?? "photo";

  if (!dropboxConfigured()) {
    return (
      <>
        <header className="page-head">
          <h1>Dropbox</h1>
          <p className="muted">Import files from Dropbox straight into the asset library.</p>
        </header>
        <div className="panel notice-warn">
          <strong>Dropbox is not connected.</strong>
          <p className="small muted" style={{ marginTop: 6 }}>
            Add <code>DROPBOX_ACCESS_TOKEN</code> to the Vercel environment variables, then redeploy.
            See the Dropbox developer console at{" "}
            <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer">dropbox.com/developers/apps</a>.
          </p>
        </div>
      </>
    );
  }

  const account = await whoAmI();

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Dropbox</h1>
          <p className="muted">
            {account ? (
              <>Connected as <strong>{account.name}</strong> · {account.email}</>
            ) : (
              <>Connected (couldn&rsquo;t fetch account name)</>
            )}
          </p>
        </div>
        <div className="head-side">
          <Link href="/assets" className="link small">Asset library →</Link>
        </div>
      </header>

      {!canEdit ? (
        <p className="muted">You need editor access to import files.</p>
      ) : (
        <DropboxBrowser startPath={startPath} defaultKind={kind} />
      )}
    </>
  );
}
