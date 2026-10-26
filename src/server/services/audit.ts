// Every admin mutation writes one audit row: who, action, target, before → after.
// The table is append-only (database trigger).
import * as schema from '@/server/db/schema';
import type { AnyDb } from './holds';

export type AuditEntry = {
  actor: { id: string; name: string } | 'system';
  action: string;
  entity: string;
  entityId?: string | null;
  target?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/** Keeps only the fields that changed, so the log reads "GHS 240 → GHS 250", not whole rows. */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) {
  if (!before || !after) return { before: before ?? null, after: after ?? null };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

export async function audit(db: AnyDb, e: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    userId: e.actor === 'system' ? null : e.actor.id,
    actorName: e.actor === 'system' ? 'System' : e.actor.name,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    target: e.target ?? null,
    before: (e.before ?? null) as never,
    after: (e.after ?? null) as never,
    ip: e.ip ?? null,
  });
}
