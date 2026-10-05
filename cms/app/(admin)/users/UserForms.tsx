"use client";
import { useActionState } from "react";
import { createUser, resetLink, type UserActionResult } from "@/lib/actions";

function Result({ state }: { state: UserActionResult | null }) {
  if (!state) return null;
  return (
    <div className={state.ok ? "notice" : "error"} role="status">
      <p>{state.message}</p>
      {state.link && (
        <p className="copy-row">
          <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(state.link!)}>
            Copy
          </button>
        </p>
      )}
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, null);
  return (
    <form action={action} className="panel form-grid">
      <h2>Add a user</h2>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Name
        <input name="displayName" />
      </label>
      <label>
        Role
        <select name="role" defaultValue="editor">
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <Result state={state} />
    </form>
  );
}

export function ResetLinkButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetLink, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <button className="link small" disabled={pending}>Password link</button>
      <Result state={state} />
    </form>
  );
}
