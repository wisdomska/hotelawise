import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueCode, makePass, readPass, verifyCode } from '@/server/services/guest-access';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'guest-access-secret-123456';
beforeAll(async () => {
  h = await freshDb('guest_access');
});
afterAll(async () => h?.drop());

const T0 = new Date('2027-01-01T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('manage-booking codes', () => {
  it('accepts the right code once', async () => {
    const r = await issueCode(h.db, 'AW-AAAA', SECRET, T0);
    if (!r.ok) throw new Error('no code');
    expect(r.code).toMatch(/^\d{6}$/);
    expect(await verifyCode(h.db, 'AW-AAAA', r.code, SECRET, at(1000))).toEqual({ ok: true });
    expect(await verifyCode(h.db, 'AW-AAAA', r.code, SECRET, at(2000))).toEqual({ ok: false, reason: 'expired' });
  });

  it('expires after ten minutes', async () => {
    const r = await issueCode(h.db, 'AW-BBBB', SECRET, T0);
    if (!r.ok) throw new Error('no code');
    expect(await verifyCode(h.db, 'AW-BBBB', r.code, SECRET, at(10 * 60_000 + 1))).toEqual({ ok: false, reason: 'expired' });
  });

  it('locks after five wrong guesses, even if the sixth is right', async () => {
    const r = await issueCode(h.db, 'AW-CCCC', SECRET, T0);
    if (!r.ok) throw new Error('no code');
    const wrong = r.code === '000000' ? '111111' : '000000';
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await verifyCode(h.db, 'AW-CCCC', wrong, SECRET, at(1000)));
    expect(results.map((x) => (x.ok ? 'ok' : `${x.reason}:${x.attemptsLeft ?? ''}`))).toEqual([
      'wrong:4',
      'wrong:3',
      'wrong:2',
      'wrong:1',
      'locked:',
    ]);
    expect(await verifyCode(h.db, 'AW-CCCC', r.code, SECRET, at(2000))).toEqual({ ok: false, reason: 'locked' });
  });

  it('sends at most three codes per booking in ten minutes', async () => {
    for (let i = 0; i < 3; i++) expect((await issueCode(h.db, 'AW-DDDD', SECRET, at(i * 1000))).ok).toBe(true);
    expect(await issueCode(h.db, 'AW-DDDD', SECRET, at(5000))).toEqual({ ok: false, reason: 'too_many' });
    expect((await issueCode(h.db, 'AW-DDDD', SECRET, at(11 * 60_000))).ok).toBe(true);
  });
});

describe('manage pass', () => {
  it('is valid for its booking for thirty minutes and cannot be forged', async () => {
    const pass = await makePass('AW-EEEE', SECRET, T0);
    expect(await readPass(pass, SECRET, at(29 * 60_000))).toBe('AW-EEEE');
    expect(await readPass(pass, SECRET, at(31 * 60_000))).toBeNull();
    expect(await readPass(pass.replace('AW-EEEE', 'AW-FFFF'), SECRET, at(1000))).toBeNull();
    expect(await readPass(pass, 'another-secret-0000000', at(1000))).toBeNull();
    expect(await readPass(undefined, SECRET, at(1000))).toBeNull();
  });
});
