import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { freshDb } from './db';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));

let h: Awaited<ReturnType<typeof freshDb>>;

beforeAll(async () => {
  h = await freshDb('sitedata');
  const url = (h.pool as unknown as { options: { connectionString: string } }).options.connectionString;
  execSync('pnpm exec tsx scripts/seed.ts', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  process.env.DATABASE_URL = url;
  process.env.DATABASE_DRIVER = 'pg';
  process.env.BETTER_AUTH_SECRET = 'x'.repeat(40);
  process.env.REF_SECRET = 'y'.repeat(20);
});
afterAll(async () => h?.drop());

describe('site data', () => {
  it('matches the seeded catalogue whether it comes from the database or the fallback', async () => {
    const { getSiteData, defaultSiteData } = await import('@/server/content/site-data');
    const fromDb = await getSiteData();
    const fallback = defaultSiteData();
    expect(fromDb.rooms.map((r) => [r.code, r.from, r.roomNumbers.length])).toEqual(
      fallback.rooms.map((r) => [r.code, r.from, r.roomNumbers.length]),
    );
    expect(fromDb.rooms.find((r) => r.code === 'EXE')!.variants.map((v) => v.displayCode)).toEqual(['EXE', 'EXE+']);
    expect(fromDb.content['home.heroTitle']).toBe('Your gateway to unforgettable memories');
    expect(fromDb.faqs).toHaveLength(8);
    expect(fromDb.rentals.map((r) => r.slug)).toEqual(fallback.rentals.map((r) => r.slug));
    expect(fromDb.bundles[0]).toEqual(fallback.bundles[0]);
    expect(Object.keys(fromDb.photos).length).toBeGreaterThanOrEqual(29);
    expect(fromDb.testimonial?.from).toBe('John & Mary P. · Achimota');
  });
  it('falls back to default copy when an admin field is blank', async () => {
    await h.pool.query(`update content_blocks set value = '  ' where key = 'home.heroSub'`);
    const { getSiteData } = await import('@/server/content/site-data');
    expect((await getSiteData()).content['home.heroSub']).toMatch(/front desk that never closes/);
  });
});
