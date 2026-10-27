import { beforeEach, describe, expect, it, vi } from 'vitest';

const sweep = vi.fn();
const release = vi.fn();
const remind = vi.fn();
const tidy = vi.fn();
const tx = { tag: 'tx' };
vi.mock('server-only', () => ({}));
vi.mock('@/server/platform/db', () => ({ withTransactionDb: (fn: (db: unknown) => unknown) => fn(tx) }));
vi.mock('@/server/services/holds', () => ({ sweepExpiredHolds: (...a: unknown[]) => sweep(...a) }));
vi.mock('@/server/services/reminders', () => ({
  releaseUnpaidPickups: (...a: unknown[]) => release(...a),
  sendReminders: (...a: unknown[]) => remind(...a),
}));
vi.mock('@/server/services/housekeeping', () => ({ housekeeping: (...a: unknown[]) => tidy(...a) }));

const { run } = await import('@/server/services/jobs');
const AT = new Date('2027-01-05T07:00:00Z');

describe('scheduled jobs', () => {
  beforeEach(() => {
    for (const f of [sweep, release, remind, tidy]) f.mockReset();
  });

  it('every 15 minutes releases lapsed holds and unpaid pay-at-pickup orders', async () => {
    sweep.mockResolvedValue(3);
    release.mockResolvedValue(1);
    expect(await run('every15', AT)).toEqual({ holds: 3, orders: 1 });
    expect(sweep).toHaveBeenCalledWith(tx, AT);
    expect(release).toHaveBeenCalledWith(tx, AT);
    expect(remind).not.toHaveBeenCalled();
  });

  it('07:00 sends reminders for the Accra date', async () => {
    remind.mockResolvedValue({ checkIn: 2, pickup: 1, returns: 0 });
    expect(await run('daily07', AT)).toEqual({ checkIn: 2, pickup: 1, returns: 0 });
    expect(remind).toHaveBeenCalledWith(tx, '2027-01-05', AT);
  });

  it('02:00 runs housekeeping only', async () => {
    tidy.mockResolvedValue({ codes: 4 });
    expect(await run('daily02', AT)).toEqual({ codes: 4 });
    expect(sweep).not.toHaveBeenCalled();
    expect(remind).not.toHaveBeenCalled();
  });

  it('ignores an unknown job', async () => {
    expect(await run('nope' as never, AT)).toEqual({});
  });
});
