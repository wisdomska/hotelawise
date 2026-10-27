// Shared fixed-window counters for rate limits (DECISIONS D-40).
import { lt, sql } from 'drizzle-orm';
import { rateLimits } from '@/server/db/schema';
import type { AnyDb } from './holds';

/** Counts one call against the key's window and returns the running count, in one atomic statement. */
export async function countCall(db: AnyDb, key: string, windowSeconds: number): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: sql`now() + make_interval(secs => ${windowSeconds})` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then now() + make_interval(secs => ${windowSeconds}) else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row!.count;
}

/** Deletes windows that ended more than a day ago; returns how many went. */
export async function pruneRateLimits(db: AnyDb, now = new Date()): Promise<number> {
  const gone = await db
    .delete(rateLimits)
    .where(lt(rateLimits.resetAt, new Date(now.getTime() - 86_400_000)))
    .returning({ key: rateLimits.key });
  return gone.length;
}
