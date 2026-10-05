import { query } from "./db";

export async function audit(
  userId: string | null,
  action: string,
  entity?: { type: string; id: string | null; field?: string },
  change?: { old?: unknown; new?: unknown },
  metadata: Record<string, unknown> = {},
) {
  try {
    await query(
      `INSERT INTO audit_events (user_id, action, entity_type, entity_id, field_name, old_value, new_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entity?.type ?? null,
        entity?.id ?? null,
        entity?.field ?? null,
        change && "old" in change ? JSON.stringify(change.old) : null,
        change && "new" in change ? JSON.stringify(change.new) : null,
        JSON.stringify(metadata),
      ],
    );
  } catch (err) {
    console.error("[audit] failed to record event", action, err);
  }
}
