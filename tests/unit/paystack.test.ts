import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

async function load(secret?: string) {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', 'postgres://x');
  vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32));
  vi.stubEnv('REF_SECRET', 'y'.repeat(16));
  vi.stubEnv('PAYSTACK_SECRET_KEY', secret ?? '');
  return import('@/server/integrations/paystack');
}

afterEach(() => vi.unstubAllEnvs());

describe('Paystack webhook signature', () => {
  it('accepts the HMAC-SHA512 of the raw body and rejects anything else', async () => {
    const p = await load('sk_test_abc');
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'AWP-1' } });
    const good = createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
    expect(await p.validSignature(body, good)).toBe(true);
    expect(await p.validSignature(body, good.toUpperCase())).toBe(true);
    expect(await p.validSignature(body + ' ', good)).toBe(false);
    expect(await p.validSignature(body, null)).toBe(false);
    expect(await p.validSignature(body, 'abc')).toBe(false);
  });

  it('refuses every signature when no secret is configured', async () => {
    const p = await load('');
    expect(p.paystackConfigured()).toBe(false);
    expect(await p.validSignature('{}', createHmac('sha512', '').update('{}').digest('hex'))).toBe(false);
  });
});

describe('failure reasons', () => {
  it('turns gateway responses into plain words', async () => {
    const p = await load('sk_test_abc');
    expect(p.failureReason('Insufficient Funds', 'momo')).toBe('The wallet did not have enough money.');
    expect(p.failureReason('Transaction timed out', 'momo')).toBe('The prompt timed out before a PIN was entered.');
    expect(p.failureReason('Declined', 'card')).toBe('Your bank declined the card.');
    expect(p.failureReason(undefined, 'momo')).toBe('The prompt was declined or timed out.');
  });
});
