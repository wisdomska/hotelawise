import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const confirmPassword = vi.fn();
class StepUpFailedError extends Error {}
vi.mock('@/server/auth/actor', () => ({
  confirmPassword: (...a: unknown[]) => confirmPassword(...a),
  StepUpFailedError,
  SetupRequiredError: class extends Error {},
}));
vi.mock('@/server/auth/session', () => ({ requirePermission: async () => ({ id: 'u1', name: 'Esi', role: 'super_admin' }) }));
vi.mock('@/server/platform/db', () => ({ db: async () => ({}), withTransactionDb: (fn: (d: unknown) => unknown) => fn({}) }));
const allow = vi.fn();
vi.mock('@/server/platform/rate-limit', () => ({ allow: (...a: unknown[]) => allow(...a) }));
vi.mock('@/server/content/site-data', () => ({ SITE_TAG: 'site' }));

const { act } = await import('@/server/admin/act');
const ok = vi.fn(async () => ({ ok: true as const, title: 'Done' }));

describe('the password step-up in act()', () => {
  beforeEach(() => {
    ok.mockClear();
    confirmPassword.mockReset();
    allow.mockReset().mockResolvedValue(true);
  });

  it('refuses when the password is left out of the request, without running anything', async () => {
    const r = await act('bookings.refund', ok, { password: undefined });
    expect(r).toMatchObject({ ok: false, fields: { pw: 'Enter your password.' } });
    expect(ok).not.toHaveBeenCalled();
    expect(confirmPassword).not.toHaveBeenCalled();
  });

  it('refuses a non-string or empty password', async () => {
    for (const password of ['', 123, null, { a: 1 }]) {
      expect((await act('bookings.refund', ok, { password })).ok).toBe(false);
    }
    expect(ok).not.toHaveBeenCalled();
  });

  it('checks the password, then runs', async () => {
    const r = await act('bookings.refund', ok, { password: 'secret1' });
    expect(confirmPassword).toHaveBeenCalledWith(expect.anything(), 'u1', 'secret1');
    expect(r.ok).toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('says so when the password is wrong', async () => {
    confirmPassword.mockRejectedValue(new StepUpFailedError());
    expect(await act('bookings.refund', ok, { password: 'nope' })).toMatchObject({
      ok: false,
      fields: { pw: 'That password isn’t right.' },
    });
    expect(ok).not.toHaveBeenCalled();
  });

  it('stops guessing after too many attempts', async () => {
    allow.mockResolvedValue(false);
    const r = await act('bookings.refund', ok, { password: 'guess' });
    expect(r).toMatchObject({ ok: false });
    expect(confirmPassword).not.toHaveBeenCalled();
    expect(allow).toHaveBeenCalledWith('stepUp', 'u1');
  });

  it('runs actions that need no password without asking', async () => {
    expect((await act('bookings.note', ok)).ok).toBe(true);
    expect(allow).not.toHaveBeenCalled();
  });
});
