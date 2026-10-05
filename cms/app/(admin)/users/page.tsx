import { requireAdmin, roleLabel, type Role } from "@/lib/auth";
import { query } from "@/lib/db";
import { updateUser } from "@/lib/actions";
import { CreateUserForm, ResetLinkButton } from "./UserForms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await query<{ id: string; email: string; display_name: string | null; role: Role; active: boolean; last_login_at: Date | null }>(
    "SELECT id, email, display_name, role, active, last_login_at FROM users ORDER BY active DESC, role, email",
  );
  return (
    <>
      <header className="page-head">
        <h1>Users</h1>
        <p className="muted">Admins manage users and settings. Editors can edit, approve and build catalogs.</p>
      </header>
      <section className="split wide">
        <table className="table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Last sign-in</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? undefined : "inactive"}>
                <td>
                  <span className="strong">{u.display_name || u.email}</span>
                  {u.display_name && <div className="muted small">{u.email}</div>}
                  {!u.active && <div className="missing small">Deactivated</div>}
                </td>
                <td>
                  {u.id === me.id ? (
                    roleLabel(u.role)
                  ) : (
                    <form action={updateUser} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role}>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="link small">Save</button>
                    </form>
                  )}
                </td>
                <td className="small muted">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Never"}
                </td>
                <td className="right">
                  <ResetLinkButton id={u.id} />
                  {u.id !== me.id && (
                    <form action={updateUser} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                      <button className="link small">{u.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <CreateUserForm />
      </section>
    </>
  );
}
