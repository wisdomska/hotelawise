import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createAuth } from '@/server/auth/auth';
import { createUser } from '@/server/auth/users';
import { confirmPassword, loadActor, StepUpFailedError } from '@/server/auth/actor';
import { audit } from '@/server/services/audit';
import { createPasswordHasher } from '@/server/auth/password';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
const codes: string[] = [];
const attempts: boolean[] = [];

beforeAll(async () => {
  h = await freshDb('auth');
});
afterAll(async () => h?.drop());

const auth = () =>
  createAuth({
    db: h.db,
    secret: 'test-secret-test-secret-test-secret-32',
    baseURL: 'http://localhost:3000',
    sendResetCode: async (_e, code) => void codes.push(code),
    onSignInAttempt: async (e) => void attempts.push(e.success),
  });

describe('password hashing (bcrypt in Postgres)', () => {
  it('hashes with a random salt at cost 12 and verifies', async () => {
    const hasher = createPasswordHasher(h.db);
    const a = await hasher.hash('kente2026');
    const b = await hasher.hash('kente2026');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$2a\$12\$/);
    expect(await hasher.verify({ hash: a, password: 'kente2026' })).toBe(true);
    expect(await hasher.verify({ hash: a, password: 'kente2027' })).toBe(false);
    expect(await hasher.verify({ hash: 'garbage', password: 'x' })).toBe(false);
    expect(await hasher.verify({ hash: a, password: "x' or '1'='1" })).toBe(false);
  });
});

describe('admin sign-in', () => {
  it('signs in with the right password, rejects the wrong one, and records both', async () => {
    const id = await createUser(h.db, {
      name: 'Esi Asamoah',
      email: 'Esi@HotelAwise.com',
      role: 'super_admin',
      temporaryPassword: 'kente2026',
    });
    const a = auth();
    const ok = await a.api.signInEmail({ body: { email: 'esi@hotelawise.com', password: 'kente2026' } });
    expect(ok.user.id).toBe(id);
    await expect(a.api.signInEmail({ body: { email: 'esi@hotelawise.com', password: 'wrong-pass1' } })).rejects.toThrow();
    expect(attempts).toEqual([true, false]);
    const actor = await loadActor(h.db, id);
    expect(actor).toMatchObject({ role: 'super_admin', mustChangePassword: true, twoFactorEnabled: false, email: 'esi@hotelawise.com' });
  });

  it('blocks deactivated staff', async () => {
    const id = await createUser(h.db, {
      name: 'Kojo Asante',
      email: 'kojo@hotelawise.com',
      role: 'staff',
      temporaryPassword: 'adinkra99',
      grants: ['content'],
    });
    expect((await loadActor(h.db, id))!.grants).toEqual(['content']);
    await h.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, id));
    await expect(auth().api.signInEmail({ body: { email: 'kojo@hotelawise.com', password: 'adinkra99' } })).rejects.toThrow();
  });

  it('re-checks the password for money actions', async () => {
    const [u] = await h.db.select().from(schema.user).where(eq(schema.user.email, 'esi@hotelawise.com'));
    await expect(confirmPassword(h.db, u!.id, 'kente2026')).resolves.toBeUndefined();
    await expect(confirmPassword(h.db, u!.id, 'nope12345')).rejects.toBeInstanceOf(StepUpFailedError);
  });

  it('sends a 6-digit reset code and enforces the password rule on reset', async () => {
    const a = auth();
    await a.api.forgetPasswordEmailOTP({ body: { email: 'esi@hotelawise.com' } });
    expect(codes.at(-1)).toMatch(/^\d{6}$/);
    await expect(
      a.api.resetPasswordEmailOTP({ body: { email: 'esi@hotelawise.com', otp: codes.at(-1)!, password: 'weak' } }),
    ).rejects.toThrow();
    await a.api.resetPasswordEmailOTP({ body: { email: 'esi@hotelawise.com', otp: codes.at(-1)!, password: 'akwaaba2026' } });
    const ok = await a.api.signInEmail({ body: { email: 'esi@hotelawise.com', password: 'akwaaba2026' } });
    expect(ok.user.email).toBe('esi@hotelawise.com');
  });

  it('writes audit rows', async () => {
    await audit(h.db, { actor: 'system', action: 'Released hold', entity: 'booking', target: 'AW-K8XX' });
    const rows = await h.db.select().from(schema.auditLog);
    expect(rows.at(-1)).toMatchObject({ actorName: 'System', action: 'Released hold' });
  });
});

describe('sign-in lockout', () => {
  const signIn = (a: ReturnType<typeof auth>) =>
    a.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'nobody@hotelawise.com', password: 'not-the-one1' }),
      }),
    );

  it('locks an address after five tries, and every isolate sees the lock', async () => {
    const first = auth();
    for (let i = 0; i < 5; i++) expect((await signIn(first)).status).toBe(401);
    expect((await signIn(first)).status).toBe(429);
    // A second instance stands in for another Worker isolate: the count lives in Postgres.
    expect((await signIn(auth())).status).toBe(429);
    const rows = await h.db.select().from(schema.authRateLimit);
    expect(rows.some((r) => r.key.includes('203.0.113.9') && r.count >= 5)).toBe(true);
  });
});
