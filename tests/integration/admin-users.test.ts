import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import { createUser } from '@/server/auth/users';
import { confirmPassword, loadActor } from '@/server/auth/actor';
import { freshDb } from './db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/admin/act', () => ({
  AdminError: class AdminError extends Error {
    constructor(
      message: string,
      readonly fields?: Record<string, string>,
    ) {
      super(message);
      this.name = 'AdminError';
    }
  },
}));

const U = await import('@/server/admin/users');

let h: Awaited<ReturnType<typeof freshDb>>;
let boss: { id: string; name: string };

beforeAll(async () => {
  h = await freshDb('admin_users');
  boss = {
    id: await createUser(h.db, { name: 'Esi Asamoah', email: 'esi@example.com', role: 'super_admin', temporaryPassword: 'Start2026' }),
    name: 'Esi Asamoah',
  };
});
afterAll(async () => h?.drop());

describe('users & permissions', () => {
  it('invites staff with a one-time password and lists them as Invited', async () => {
    const out = await U.inviteUser(h.db, boss, { name: 'Kojo Asante', email: 'Kojo@Example.com ', role: 'staff', jobTitle: 'Front desk' });
    expect(out.email).toBe('kojo@example.com');
    expect(out.password).toMatch(/^Akwaaba-[a-z2-9]{8}$/);
    await confirmPassword(h.db, out.id, out.password);
    const kojo = (await U.team(h.db)).find((u) => u.id === out.id)!;
    expect(kojo).toMatchObject({ status: 'Invited', jobTitle: 'Front desk', role: 'staff' });
    expect(U.roleLabel(kojo.role, kojo.jobTitle)).toBe('Staff · Front desk');
    await expect(U.inviteUser(h.db, boss, { name: 'Again', email: 'kojo@example.com', role: 'staff', jobTitle: '' })).rejects.toThrow(
      'already has an account',
    );
  });

  it('never leaves the hotel without an active Super Admin', async () => {
    await expect(U.setActive(h.db, boss, boss.id, false)).rejects.toThrow('your own account');
    const other = { id: 'someone', name: 'Other' };
    await expect(U.setActive(h.db, other, boss.id, false)).rejects.toThrow('at least one Super Admin');
    await expect(U.updateRole(h.db, other, boss.id, 'staff', '')).rejects.toThrow('at least one Super Admin');
    await expect(U.updateRole(h.db, boss, boss.id, 'staff', '')).rejects.toThrow('your own role');
  });

  it('deactivates (signing out) and reactivates, auditing both', async () => {
    const [kojo] = await h.db.select().from(s.user).where(eq(s.user.email, 'kojo@example.com'));
    await h.db.insert(s.session).values({ id: 's1', userId: kojo!.id, token: 't1', expiresAt: new Date(Date.now() + 864e5) });
    await U.setActive(h.db, boss, kojo!.id, false);
    expect(await h.db.select().from(s.session).where(eq(s.session.userId, kojo!.id))).toHaveLength(0);
    expect((await loadActor(h.db, kojo!.id))!.active).toBe(false);
    await U.setActive(h.db, boss, kojo!.id, true);
    const log = await U.auditPage(h.db, { who: 'Esi Asamoah', what: 'user' }, 0);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['Deactivated user', 'Reactivated user', 'Invited user']));
    expect(log.rows.find((r) => r.action === 'Deactivated user')!.change).toBe('Status: Active → Deactivated');
  });

  it('toggles grants and resets passwords', async () => {
    const [kojo] = await h.db.select().from(s.user).where(eq(s.user.email, 'kojo@example.com'));
    await U.setGrant(h.db, boss, kojo!.id, 'reports', true);
    expect((await loadActor(h.db, kojo!.id))!.grants).toEqual(['reports']);
    await U.setGrant(h.db, boss, kojo!.id, 'reports', false);
    expect((await U.permissionMatrix(h.db))[0]!.grants.reports).toBe(false);
    await expect(U.setGrant(h.db, boss, boss.id, 'reports', true)).rejects.toThrow('can already do everything');
    const r = await U.resetPassword(h.db, boss, kojo!.id);
    await confirmPassword(h.db, kojo!.id, r.password);
    expect((await loadActor(h.db, kojo!.id))!.mustChangePassword).toBe(true);
  });

  it('changes my own details', async () => {
    await U.changeMyName(h.db, boss, 'Esi A. Asamoah');
    await expect(U.changeMyEmail(h.db, boss, 'kojo@example.com')).rejects.toThrow('Someone else');
    await U.changeMyEmail(h.db, boss, 'esi.new@example.com');
    await U.changeMyPassword(h.db, boss, 'NewPass2027', null);
    await confirmPassword(h.db, boss.id, 'NewPass2027');
    const me = await U.myAccount(h.db, boss.id);
    expect(me).toMatchObject({ name: 'Esi A. Asamoah', email: 'esi.new@example.com', roleLabel: 'Super Admin' });
  });
});

describe('audit helpers', () => {
  it('describes changes and writes safe CSV', () => {
    expect(U.describeChange({ status: 'Confirmed' }, { status: 'Checked-in' })).toBe('Status: Confirmed → Checked-in');
    expect(U.describeChange(null, { total: 'GHS 300' })).toBe('Total: GHS 300');
    expect(U.toCsv([['a"b', '=SUM(A1)']])).toBe('"a""b","\'=SUM(A1)"');
    expect(U.deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBe('Chrome · Mac');
    expect(U.auditFilters({ from: 'nope', to: '2026-10-01' })).toEqual({ who: '', what: '', from: '', to: '2026-10-01' });
  });
});
