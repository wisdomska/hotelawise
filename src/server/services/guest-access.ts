// Manage-booking access: reference + phone, then a 6-digit code sent to the
// guest. A correct code yields a short-lived signed pass for that booking only.
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import type { AnyDb } from './holds';

export const PASS_COOKIE = 'aw_manage';
export const CODE_TTL_MS = 10 * 60_000;
export const PASS_TTL_MS = 30 * 60_000;
export const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashCode(code: string, ref: string, secret: string) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`${code}:${ref}:${secret}`)));
}

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, '0');
}

/** Finds the booking for a reference and the phone it was made with (the first check). */
export async function findForGuest(db: AnyDb, ref: string, phoneE164: string) {
  const [row] = await db
    .select({ id: s.bookings.id, ref: s.bookings.ref, phone: s.customers.phoneE164, email: s.customers.email })
    .from(s.bookings)
    .innerJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .where(and(eq(s.bookings.ref, ref), eq(s.customers.phoneE164, phoneE164)));
  return row ?? null;
}

export type IssueResult = { ok: true; code: string } | { ok: false; reason: 'too_many' };

export async function issueCode(db: AnyDb, ref: string, secret: string, now: Date = new Date()): Promise<IssueResult> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.guestOtps)
    .where(and(eq(s.guestOtps.ref, ref), gt(s.guestOtps.createdAt, new Date(now.getTime() - CODE_TTL_MS))));
  if (n >= MAX_CODES_PER_WINDOW) return { ok: false, reason: 'too_many' };
  const code = sixDigits();
  await db.insert(s.guestOtps).values({
    ref,
    channel: 'sms',
    codeHash: await hashCode(code, ref, secret),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    createdAt: now,
  });
  return { ok: true, code };
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'wrong' | 'expired' | 'locked'; attemptsLeft?: number };

export async function verifyCode(db: AnyDb, ref: string, code: string, secret: string, now: Date = new Date()): Promise<VerifyResult> {
  const [otp] = await db
    .select()
    .from(s.guestOtps)
    .where(and(eq(s.guestOtps.ref, ref), isNull(s.guestOtps.consumedAt), gt(s.guestOtps.expiresAt, now)))
    .orderBy(desc(s.guestOtps.createdAt))
    .limit(1);
  if (!otp) return { ok: false, reason: 'expired' };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  const good = /^\d{6}$/.test(code) && (await hashCode(code, ref, secret)) === otp.codeHash;
  if (!good) {
    const [u] = await db
      .update(s.guestOtps)
      .set({ attempts: sql`${s.guestOtps.attempts} + 1` })
      .where(eq(s.guestOtps.id, otp.id))
      .returning({ attempts: s.guestOtps.attempts });
    const left = MAX_ATTEMPTS - (u?.attempts ?? MAX_ATTEMPTS);
    return left > 0 ? { ok: false, reason: 'wrong', attemptsLeft: left } : { ok: false, reason: 'locked' };
  }
  await db.update(s.guestOtps).set({ consumedAt: now }).where(eq(s.guestOtps.id, otp.id));
  return { ok: true };
}

/** "AW-7Q3K.<expiry ms>.<hmac>": proves the bearer passed the code check for this booking. */
export async function makePass(ref: string, secret: string, now: Date = new Date()): Promise<string> {
  const exp = now.getTime() + PASS_TTL_MS;
  return `${ref}.${exp}.${await hmac(`manage:${ref}:${exp}`, secret)}`;
}

export async function readPass(pass: string | undefined, secret: string, now: Date = new Date()): Promise<string | null> {
  if (!pass) return null;
  const [ref, expStr, mac] = pass.split('.');
  const exp = Number(expStr);
  if (!ref || !mac || !Number.isFinite(exp) || exp < now.getTime()) return null;
  const want = await hmac(`manage:${ref}:${exp}`, secret);
  if (want.length !== mac.length) return null;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  return d === 0 ? ref : null;
}
