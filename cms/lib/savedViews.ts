// Shared server helper to load the current user's saved views for a given
// list-page scope.  Returns [] when no user — safe to call unconditionally.
import { query } from "./db";
import { getSessionUser } from "./auth";
import type { SavedView } from "@/components/SavedViews";

export async function loadSavedViews(scope: string): Promise<SavedView[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const rows = await query<SavedView>(
    `SELECT id, name, path, query, pinned
       FROM saved_views
       WHERE user_id = $1 AND scope = $2
       ORDER BY pinned DESC, name`,
    [user.id, scope],
  );
  return rows;
}
