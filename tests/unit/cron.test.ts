import { describe, expect, it, vi } from 'vitest';
import { cronKey, cronName, sameKey } from '@/lib/cron';
import { runScheduled } from '@/worker/scheduled';

describe('cron', () => {
  it('maps the wrangler schedules to jobs', () => {
    expect(cronName('*/15 * * * *')).toBe('every15');
    expect(cronName('0 7 * * *')).toBe('daily07');
    expect(cronName('0 2 * * *')).toBe('daily02');
    expect(cronName('5 4 * * *')).toBeNull();
  });

  it('derives a stable key from the secret and compares in constant time', async () => {
    const a = await cronKey('secret-one');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await cronKey('secret-one')).toBe(a);
    expect(await cronKey('secret-two')).not.toBe(a);
    expect(sameKey(a, a)).toBe(true);
    expect(sameKey(a, await cronKey('secret-two'))).toBe(false);
    expect(sameKey(a, a.slice(1))).toBe(false);
  });

  it('calls the app’s cron route with the key and the scheduled time', async () => {
    const fetchApp = vi.fn(async () => new Response('{}'));
    const env = { BETTER_AUTH_SECRET: 's'.repeat(40), APP_URL: 'https://example.test' } as unknown as CloudflareEnv;
    const ctx = {} as ExecutionContext;
    await runScheduled('0 7 * * *', new Date('2027-01-05T07:00:00Z'), env, ctx, fetchApp);
    const [req] = fetchApp.mock.calls[0] as unknown as [Request];
    expect(req.url).toBe('https://example.test/api/cron/daily07');
    expect(req.method).toBe('POST');
    expect(req.headers.get('x-cron-key')).toBe(await cronKey('s'.repeat(40)));
    expect(req.headers.get('x-cron-at')).toBe('2027-01-05T07:00:00.000Z');
    fetchApp.mockClear();
    await runScheduled('1 2 3 4 5', new Date(), env, ctx, fetchApp);
    expect(fetchApp).not.toHaveBeenCalled();
  });
});
