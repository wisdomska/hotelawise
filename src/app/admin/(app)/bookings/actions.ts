'use server';
// Front-desk actions on room bookings. Each checks the user's permission (and
// password when money moves) and writes an audit row through the service.
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { DESK_METHODS, METHOD, type Method } from '@/lib/admin/labels';
import { isIsoDate, todayInAccra } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { parseGhanaPhone } from '@/lib/phone';
import { act, AdminError, read } from '@/server/admin/act';
import {
  addRoomService,
  bookingDetail,
  cancelBookingAtDesk,
  checkInBooking,
  checkOutBooking,
  createDeskBooking,
  deleteBooking,
  deskQuote,
  deskVariants,
  moveBooking,
  recordBookingPayment,
  roomDetail,
  setBookingNote,
  setRoomStatus,
  SETTABLE_ROOM_STATUS,
  undoCheckIn,
} from '@/server/admin/bookings';
import { issueRefund } from '@/server/admin/refunds';
import { contactAndTemplate } from '@/server/services/payment-flow';
import { bookingCancelled, bookingConfirmed, datesChanged } from '@/server/services/notify';
import { bookingBy } from '@/server/services/bookings';
import { db } from '@/server/platform/db';
import { env } from '@/server/platform/env';

const ref = z.string().regex(/^AW-[A-Z0-9]{3,8}$/);
const method = z.enum(DESK_METHODS as [Method, ...Method[]]);
const cedis = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '')) * 100);

/* ── reads for the drawer and modals ── */

export async function loadBooking(r: string) {
  if (!ref.safeParse(r).success) return null;
  return read('bookings.view', async (d, who) => {
    const b = await bookingDetail(d, r);
    return b ? { ...b, isSuper: who.isSuper } : null;
  });
}

export async function loadDeskOptions() {
  return read('bookings.create', async (d) => ({ variants: await deskVariants(d), today: todayInAccra() }));
}

export async function quoteDesk(input: { variant: string; checkIn: string; nights: number; guests: number }) {
  if (!isIsoDate(input.checkIn) || input.nights < 1 || input.nights > 60) return null;
  return read('bookings.create', async (d) => {
    const q = await deskQuote(d, { ...input, nights: Math.floor(input.nights), guests: Math.max(1, Math.floor(input.guests)) });
    return { free: q.free, total: q.total, checkOut: q.checkOut };
  });
}

export async function loadRoom(number: string) {
  if (!/^\d{3}$/.test(number)) return null;
  return read('rooms.view', (d) => roomDetail(d, number, todayInAccra()));
}

/* ── changes ── */

const deskSchema = z.object({
  guest: z.string().trim().min(2).max(80),
  phone: z.string().max(32),
  email: z.string().trim().max(120),
  variant: z.string().max(20),
  checkIn: z.string().refine(isIsoDate),
  nights: z.number().int().min(1).max(60),
  guests: z.number().int().min(1).max(6),
  room: z.string().regex(/^\d{3}$/),
  source: z.enum(['walk_in', 'phone', 'whatsapp']),
  pay: z.union([method, z.literal('none')]),
  txn: z.string().max(60),
  password: z.string().max(200),
});

export async function createBookingAction(raw: z.input<typeof deskSchema>) {
  const i = deskSchema.parse(raw);
  const ph = parseGhanaPhone(i.phone);
  if (!ph.ok) return { ok: false as const, error: 'Check the phone number.', fields: { phone: ph.error } };
  const phone = ph.e164;
  if (i.email && !/^\S+@\S+\.\S+$/.test(i.email))
    return { ok: false as const, error: 'Check the email.', fields: { email: 'Check the email address.' } };
  const paying = i.pay !== 'none';
  if (paying && i.pay !== 'cash' && i.txn.trim().length < 4)
    return { ok: false as const, error: 'Enter the transaction ID.', fields: { txn: 'Enter the transaction ID.' } };
  const res = await act(
    paying ? 'bookings.payment.desk' : 'bookings.create',
    async (tx, who) => {
      const r = await createDeskBooking(tx, who, {
        guest: { name: i.guest, phoneE164: phone, email: i.email || null },
        variant: i.variant,
        checkIn: i.checkIn,
        nights: i.nights,
        guests: i.guests,
        room: i.room,
        source: i.source,
        pay: paying ? { method: i.pay as Method, txn: i.txn.trim() } : null,
        refSecret: env().REF_SECRET,
      });
      return done(`${r.ref} created.`, `Room ${i.room} · ${formatGhs(r.total)}. The guest gets a confirmation.`, { ref: r.ref });
    },
    paying ? { password: i.password } : {},
  );
  if (res.ok) {
    // Phone and WhatsApp guests need the reference; walk-ins get it for their records.
    try {
      const b = await bookingBy(await db(), { ref: (res.data as { ref: string }).ref });
      const { contact, smsTemplate } = await contactAndTemplate();
      if (b) await bookingConfirmed(b, contact, smsTemplate);
    } catch (e) {
      console.error('desk booking confirmation failed', e);
    }
  }
  return res;
}

export async function recordPaymentAction(raw: { ref: string; amount: string; method: string; txn: string; password: string }) {
  const r = ref.parse(raw.ref);
  const m = method.parse(raw.method);
  const amount = cedis(raw.amount);
  if (!(amount > 0)) return { ok: false as const, error: 'Enter an amount above 0.', fields: { amount: 'Enter an amount above 0.' } };
  if (m !== 'cash' && raw.txn.trim().length < 4)
    return { ok: false as const, error: 'Enter the transaction ID.', fields: { txn: 'Enter the transaction ID.' } };
  return act(
    'bookings.payment.desk',
    async (tx, who) => {
      try {
        await recordBookingPayment(tx, who, { ref: r, amount, method: m, txn: raw.txn.trim() });
      } catch (e) {
        if (e instanceof Error && /balance|above 0/.test(e.message)) throw new AdminError(e.message, { amount: e.message });
        throw e;
      }
      return done('Payment recorded.', `${formatGhs(amount)} · ${METHOD[m]}`);
    },
    { password: raw.password },
  );
}

export async function checkInAction(r: string) {
  return act('bookings.checkin', async (tx, who) => {
    const b = await checkInBooking(tx, who, ref.parse(r));
    return done(`${b.guest} checked in.`, `Room ${b.room}`);
  });
}

export async function checkOutAction(r: string) {
  return act('bookings.checkout', async (tx, who) => {
    const b = await checkOutBooking(tx, who, ref.parse(r));
    return done(`${b.guest} checked out.`, `Room ${b.room} set to Cleaning.`);
  });
}

export async function undoCheckInAction(r: string, reason: string) {
  const why = reason.trim().slice(0, 300);
  return act('bookings.checkin', async (tx, who) => {
    await undoCheckIn(tx, who, ref.parse(r), why);
    return done(`${r} moved back.`, 'Now "Confirmed".');
  });
}

export async function cancelBookingAction(r: string) {
  const res = await act('bookings.edit', async (tx, who) => {
    const out = await cancelBookingAtDesk(tx, who, ref.parse(r));
    return done(
      `${r} cancelled.`,
      out.paid > 0 ? `The guest paid ${formatGhs(out.paid)}. Refund it from the booking if you need to.` : 'The guest gets an SMS.',
      out.booking,
    );
  });
  if (res.ok && res.data) {
    const { contact } = await contactAndTemplate();
    await bookingCancelled(res.data as never, 0, '', contact).catch(() => undefined);
    return { ...res, data: undefined };
  }
  return res;
}

export async function addRoomServiceAction(r: string) {
  return act('bookings.edit', async (tx, who) => {
    const { fee } = await addRoomService(tx, who, ref.parse(r));
    return done('Room service added.', `${r} · ${formatGhs(fee)}`);
  });
}

export async function saveBookingNote(r: string, note: string) {
  return act('bookings.note', async (tx, who) => {
    await setBookingNote(tx, who, ref.parse(r), note.slice(0, 2000));
    return done('Note saved.');
  });
}

export async function deleteBookingAction(r: string) {
  return act('bookings.delete', async (tx, who) => {
    await deleteBooking(tx, who, ref.parse(r));
    return done(`${r} deleted.`);
  });
}

export async function moveBookingAction(input: { ref: string; mode: 'move' | 'extend'; delta: number }) {
  const i = z.object({ ref, mode: z.enum(['move', 'extend']), delta: z.number().int().min(-60).max(60) }).parse(input);
  const res = await act('bookings.edit', async (tx, who) => {
    const out = await moveBooking(tx, who, i);
    return done(
      i.mode === 'move' ? `${i.ref} moved.` : `${i.ref} is now ${out.nights} night${out.nights > 1 ? 's' : ''}.`,
      `${out.checkIn} → ${out.checkOut} · guest notified by SMS`,
      out.booking,
    );
  });
  if (res.ok && res.data) {
    const { contact } = await contactAndTemplate();
    await datesChanged(res.data as never, contact).catch(() => undefined);
    return { ...res, data: undefined };
  }
  return res;
}

export async function refundBookingAction(raw: { ref: string; amount: string; reason: string; password: string }) {
  const r = ref.parse(raw.ref);
  const amount = cedis(raw.amount);
  if (!(amount > 0)) return { ok: false as const, error: 'Enter an amount above 0.', fields: { amount: 'Enter an amount above 0.' } };
  return act(
    'bookings.refund',
    async (tx, who) => {
      const b = await bookingDetail(tx, r);
      if (!b) throw new AdminError('That booking no longer exists.');
      const { schema } = await import('@/server/db/client');
      const { eq } = await import('drizzle-orm');
      const [row] = await tx.select({ id: schema.bookings.id }).from(schema.bookings).where(eq(schema.bookings.ref, r));
      try {
        const out = await issueRefund(tx, who, {
          target: { bookingId: row!.id },
          label: `${r} · ${b.guest}`,
          amount,
          reason: raw.reason.slice(0, 120),
        });
        return done(
          'Refund issued.',
          out.failed
            ? `Paystack couldn’t send ${formatGhs(out.failed)}. Pay that part back by hand; it’s marked Failed in Payments.`
            : `${formatGhs(amount)} on its way back.`,
        );
      } catch (e) {
        if (e instanceof Error && e.name === 'RefundError') throw new AdminError(e.message, { amount: e.message });
        throw e;
      }
    },
    { password: raw.password },
  );
}

export async function setRoomStatusAction(number: string, status: string) {
  const st = z.enum(SETTABLE_ROOM_STATUS).parse(status);
  return act('rooms.status', async (tx, who) => {
    await setRoomStatus(
      tx,
      who,
      z
        .string()
        .regex(/^\d{3}$/)
        .parse(number),
      st,
    );
    const label = { available: 'Available', cleaning: 'Cleaning', maintenance: 'Maintenance', out_of_order: 'Out of order' }[st];
    return done(
      `Room ${number}: ${label}.`,
      st === 'available' ? 'It can be booked again.' : st === 'cleaning' ? '' : 'It won’t be sold online until it’s ready.',
    );
  });
}
