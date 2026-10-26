import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sweep = vi.fn();
const tx = { tag: 'tx' };
vi.mock('@/server/platform/db', () => ({ withTransactionDb: (fn: (db: unknown) => unknown) => fn(tx) }));
vi.mock('@/server/services/holds', () => ({ sweepExpiredHolds: (...a: unknown[]) => sweep(...a) }));

const { run } = await import('@/server/services/jobs');
const env = {} as CloudflareEnv;
const AT = new Date('2027-01-05T10:15:00Z');

describe('scheduled jobs', () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => {
    sweep.mockReset();
    process.env.DATABASE_URL = 'postgres://example/db';
  });
  afterEach(() => {
    process.env.DATABASE_URL = saved;
  });

  it('every 15 minutes releases lapsed holds in a transaction and logs how many', async () => {
    sweep.mockResolvedValue(3);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await run('every15', AT, env);
    expect(sweep).toHaveBeenCalledWith(tx, AT);
    expect(info).toHaveBeenCalledWith('cron: released 3 expired hold(s)');
    sweep.mockResolvedValue(0);
    info.mockClear();
    await run('every15', AT, env);
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('does nothing without a database or for other schedules', async () => {
    delete process.env.DATABASE_URL;
    await run('every15', AT, env);
    process.env.DATABASE_URL = 'postgres://example/db';
    await run('daily07', AT, env);
    expect(sweep).not.toHaveBeenCalled();
  });
});
