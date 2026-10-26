import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rateLimits } from '@/server/db/schema';
import { countCall, pruneRateLimits } from '@/server/services/rate-limits';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
beforeAll(async () => {
  h = await freshDb('rate_limits');
});
afterAll(async () => h?.drop());

describe('rate-limit counters', () => {
  it('counts calls within a window, per key', async () => {
    expect(await countCall(h.db, 'test:hold:1.1.1.1', 600)).toBe(1);
    expect(await countCall(h.db, 'test:hold:1.1.1.1', 600)).toBe(2);
    expect(await countCall(h.db, 'test:hold:2.2.2.2', 600)).toBe(1);
    expect(await countCall(h.db, 'test:hold:1.1.1.1', 600)).toBe(3);
  });

  it('starts a fresh window once the old one has ended', async () => {
    await countCall(h.db, 'test:otp:a', 600);
    await countCall(h.db, 'test:otp:a', 600);
    await h.db
      .update(rateLimits)
      .set({ resetAt: sql`now() - interval '1 second'` })
      .where(eq(rateLimits.key, 'test:otp:a'));
    expect(await countCall(h.db, 'test:otp:a', 600)).toBe(1);
    const [row] = await h.db.select().from(rateLimits).where(eq(rateLimits.key, 'test:otp:a'));
    expect(row!.resetAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
  });

  it('counts concurrent calls without losing any', async () => {
    const counts = await Promise.all(Array.from({ length: 20 }, () => countCall(h.db, 'test:burst:x', 600)));
    expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('prunes windows that ended over a day ago', async () => {
    await countCall(h.db, 'test:old:z', 600);
    await h.db
      .update(rateLimits)
      .set({ resetAt: sql`now() - interval '2 days'` })
      .where(eq(rateLimits.key, 'test:old:z'));
    expect(await pruneRateLimits(h.db)).toBe(1);
    expect(await h.db.select().from(rateLimits).where(eq(rateLimits.key, 'test:old:z'))).toEqual([]);
    expect((await h.db.select().from(rateLimits)).length).toBeGreaterThan(0);
  });
});
