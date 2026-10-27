'use server';
// Manage my booking: reference + phone, a 6-digit code, then changes. Every
// change re-checks the signed pass, which covers one booking for 30 minutes.
import { cookies } from 'next/headers';
import { isIsoDate, nightsBetween } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { parseGhanaPhone, parseInternationalPhone } from '@/lib/phone';
import { isRef, normaliseRef } from '@/lib/refs';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';
import { db, withTransactionDb } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';
import { audit } from '@/server/services/audit';
import { bookingBy, cancelByGuest, changeDatesByGuest, previewDateChange } from '@/server/services/bookings';
import { findForGuest, issueCode, makePass, PASS_COOKIE, PASS_TTL_MS, readPass, verifyCode } from '@/server/services/guest-access';
import { bookingCancelled, datesChanged, guestCode } from '@/server/services/notify';

const ready = () => !!process.env.DATABASE_URL;

async function desk() {
  const ct = contactFrom(await getSiteData());
  return { phone: ct.phone, email: ct.email };
}

async function currentRef(): Promise<string | null> {
  const jar = await cookies();
  return readPass(jar.get(PASS_COOKIE)?.value, env().REF_SECRET);
}

function phoneOf(input: string) {
  const t = input.trim();
  return t.startsWith('+') && !t.startsWith('+233') ? parseInternationalPhone(t, t.slice(0, 4)) : parseGhanaPhone(t);
}

export type FindResult = { ok: true; ref: string; sentTo: string[] } | { ok: false; error: string };

export async function findBooking(refInput: string, phoneInput: string): Promise<FindResult> {
  const ref = normaliseRef(String(refInput ?? ''));
  const phone = phoneOf(String(phoneInput ?? ''));
  if (!ref || !String(phoneInput ?? '').trim()) return { ok: false, error: 'Enter your booking reference and phone number.' };
  if (!(await allow('bookingLookup', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a few minutes, or call us.' };
  const { phone: deskPhone } = await desk();
  const notFound = `We couldn't find a booking with that reference and phone number. Check the SMS we sent, or call ${deskPhone}.`;
  if (!ready() || !isRef(ref, 'booking') || !phone.ok) return { ok: false, error: notFound };
  const found = await findForGuest(await db(), ref, phone.e164);
  if (!found) return { ok: false, error: notFound };
  const issued = await issueCode(await db(), ref, env().REF_SECRET);
  if (!issued.ok) return { ok: false, error: 'We’ve sent three codes in the last ten minutes. Wait a little, or call the desk.' };
  const sentTo = await guestCode(found.phone, found.email, issued.code);
  if (!sentTo.length) return { ok: false, error: `We couldn't send a code just now. Call ${deskPhone} and the desk will help.` };
  return { ok: true, ref, sentTo };
}

export async function confirmCode(refInput: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ref = normaliseRef(String(refInput ?? ''));
  if (!(await allow('guestOtp', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a few minutes.' };
  if (!ready() || !isRef(ref, 'booking')) return { ok: false, error: 'That code didn’t match. Check it and try again.' };
  const r = await verifyCode(await db(), ref, String(code ?? '').trim(), env().REF_SECRET);
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === 'expired'
          ? 'That code has expired. Send a new one.'
          : r.reason === 'locked'
            ? 'Too many wrong codes. Send a new one.'
            : `That code didn’t match. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`,
    };
  }
  const jar = await cookies();
  jar.set(PASS_COOKIE, await makePass(ref, env().REF_SECRET), {
    httpOnly: true,
    sameSite: 'strict',
    secure: env().APP_ENV !== 'development',
    path: '/',
    maxAge: PASS_TTL_MS / 1000,
  });
  return { ok: true };
}

export async function leaveBooking(): Promise<void> {
  (await cookies()).delete(PASS_COOKIE);
}

export type DatesCheck = { ok: boolean; note: string; tone: 'good' | 'bad' | 'neutral' };

export async function checkDates(checkIn: string, checkOut: string): Promise<DatesCheck> {
  const ref = await currentRef();
  if (!ref) return { ok: false, note: 'Your session ended. Look the booking up again.', tone: 'bad' };
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || nightsBetween(checkIn, checkOut) < 1)
    return { ok: false, note: 'Check-out must be after check-in.', tone: 'bad' };
  if (!(await allow('manage', await clientIp()))) return { ok: false, note: 'Too many checks. Give it a minute.', tone: 'bad' };
  const r = await previewDateChange(await db(), ref, checkIn, checkOut);
  if (r.ok)
    return {
      ok: true,
      tone: 'good',
      note: `Free for those dates. New total ${formatGhs(r.newTotal)}${r.due > 0 ? `, ${formatGhs(r.due)} due at check-in` : ''}.`,
    };
  if (r.reason === 'unchanged') return { ok: false, tone: 'neutral', note: 'These are your current dates.' };
  if (r.reason === 'range') return { ok: false, tone: 'bad', note: 'Check-out must be after check-in.' };
  const b = await bookingBy(await db(), { ref });
  return { ok: false, tone: 'bad', note: `Sorry, the ${b?.variantName ?? ''} room is booked on one of those nights. Try other dates.` };
}

export async function saveDates(checkIn: string, checkOut: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ref = await currentRef();
  if (!ref) return { ok: false, error: 'Your session ended. Look the booking up again.' };
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return { ok: false, error: 'Check-out must be after check-in.' };
  if (!(await allow('manage', await clientIp()))) return { ok: false, error: 'Too many changes. Give it a minute.' };
  const r = await withTransactionDb(async (tx) => {
    const out = await changeDatesByGuest(tx, ref, checkIn, checkOut);
    if (out.ok) {
      await audit(tx, {
        actor: 'guest',
        action: 'Changed dates',
        entity: 'booking',
        target: ref,
        before: out.before,
        after: { checkIn, checkOut },
        ip: await clientIp(),
      });
    }
    return out;
  });
  if (!r.ok) return { ok: false, error: r.reason === 'unavailable' ? 'Those dates have just gone. Try others.' : 'Pick new dates first.' };
  const b = await bookingBy(await db(), { ref });
  if (b) await datesChanged(b, await desk());
  return { ok: true };
}

export async function cancelBooking(): Promise<{ ok: true; refund: number } | { ok: false; error: string }> {
  const ref = await currentRef();
  if (!ref) return { ok: false, error: 'Your session ended. Look the booking up again.' };
  if (!(await allow('manage', await clientIp()))) return { ok: false, error: 'Too many changes. Give it a minute.' };
  try {
    const { booking, terms } = await withTransactionDb(async (tx) => {
      const out = await cancelByGuest(tx, ref);
      await audit(tx, {
        actor: 'guest',
        action: 'Cancelled booking',
        entity: 'booking',
        entityId: out.booking.id,
        target: ref,
        before: { status: out.booking.status },
        after: { status: 'cancelled', refund: out.terms.refund },
        ip: await clientIp(),
      });
      return out;
    });
    const payWay = booking.lastMethod
      ? (({ mtn: 'MTN MoMo', telecel: 'Telecel Cash', airteltigo: 'AirtelTigo Money', card: 'your card' } as Record<string, string>)[
          booking.lastMethod
        ] ?? 'the way you paid')
      : 'the way you paid';
    await bookingCancelled({ ...booking, status: 'cancelled' }, terms.refund, payWay, await desk());
    return { ok: true, refund: terms.refund };
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}
