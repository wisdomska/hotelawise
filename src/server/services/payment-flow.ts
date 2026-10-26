// What happens after Paystack says a payment went through: confirm the booking
// (once), tell the guest, and refund automatically when the room was lost.
// Shared by the webhook and the booking page's status check; both are safe to
// run for the same payment because settlePayment reports "first time" once.
import 'server-only';
import { eq } from 'drizzle-orm';
import { contactFrom } from '@/server/content/contact';
import { getSiteData, setting } from '@/server/content/site-data';
import * as s from '@/server/db/schema';
import { refundTransaction, verifyTransaction } from '@/server/integrations/paystack';
import { bookingBy, settlePayment, type SettleOutcome } from './bookings';
import type { AnyDb } from './holds';
import { bookingConfirmed, lateRefund, rentalConfirmed, rentalLateRefund, staffAlert } from './notify';
import { orderBy } from './rentals';

export async function contactAndTemplate() {
  const data = await getSiteData();
  const ct = contactFrom(data);
  return {
    contact: { phone: ct.phone, email: ct.email },
    smsTemplate: setting<string>(data, 'notify.smsTemplate'),
    hours: { pickupFrom: setting<number>(data, 'rentals.pickupFromHour'), returnBy: setting<number>(data, 'rentals.returnByHour') },
  };
}

async function refundAutomatically(db: AnyDb, refundId: string, paystackRef: string, amount: number, note: string): Promise<boolean> {
  let status: 'refunded' | 'failed' = 'failed';
  let id: string | null = null;
  try {
    const r = await refundTransaction(paystackRef, amount, note);
    status = 'refunded';
    id = String(r.id);
  } catch (err) {
    console.error('automatic refund failed', err);
  }
  await db.update(s.refunds).set({ status, paystackRefundId: id }).where(eq(s.refunds.id, refundId));
  return status === 'refunded';
}

export async function afterSettle(db: AnyDb, out: SettleOutcome) {
  if (out.kind === 'order_confirmed' && out.firstTime) {
    const o = await orderBy(db, { id: out.orderId });
    if (o) {
      const { contact, hours } = await contactAndTemplate();
      await rentalConfirmed(o, contact, hours);
    }
    return;
  }
  if (out.kind === 'order_refund') {
    const ok = await refundAutomatically(
      db,
      out.refundId,
      out.paystackRef,
      out.amount,
      'Paid after the hold expired; items no longer available',
    );
    const o = await orderBy(db, { id: out.orderId });
    const { contact } = await contactAndTemplate();
    if (o) {
      if (ok) await rentalLateRefund(o, out.amount, contact);
      await staffAlert(
        contact.email,
        ok ? `Late rental payment refunded: ${o.ref}` : `ACTION NEEDED: refund failed for ${o.ref}`,
        `${o.collectorName} (${o.phone}) paid GHS ${out.amount / 100} after the hold lapsed and some items had gone. ` +
          (ok ? 'Paystack is refunding it in full.' : 'The automatic refund failed: refund it by hand from Payments.'),
      );
    }
    return;
  }
  if (out.kind === 'confirmed' && out.firstTime) {
    const b = await bookingBy(db, await tokenOf(db, out.bookingId));
    if (b) {
      const { contact, smsTemplate } = await contactAndTemplate();
      await bookingConfirmed(b, contact, smsTemplate);
    }
  }
  if (out.kind === 'refund') {
    const ok = await refundAutomatically(
      db,
      out.refundId,
      out.paystackRef,
      out.amount,
      'Paid after the hold expired; room no longer available',
    );
    const status = ok ? 'refunded' : 'failed';
    const { contact } = await contactAndTemplate();
    const b = await bookingBy(db, await tokenOf(db, out.bookingId));
    if (b) {
      if (status === 'refunded') await lateRefund(b, out.amount, contact);
      await staffAlert(
        contact.email,
        status === 'refunded' ? `Late payment refunded: ${b.ref}` : `ACTION NEEDED: refund failed for ${b.ref}`,
        `${b.guestName} (${b.phone}) paid GHS ${out.amount / 100} after their hold lapsed and no ${b.variantName} room was left. ` +
          (status === 'refunded' ? 'Paystack is refunding it in full.' : 'The automatic refund failed: refund it by hand from Payments.'),
      );
    }
  }
}

async function tokenOf(db: AnyDb, bookingId: string): Promise<{ token?: string }> {
  const [b] = await db.select({ token: s.bookings.publicToken }).from(s.bookings).where(eq(s.bookings.id, bookingId));
  return { token: b?.token };
}

/** Asks Paystack about a payment and applies the answer. */
export async function checkAndSettle(db: AnyDb, paystackRef: string): Promise<SettleOutcome> {
  const v = await verifyTransaction(paystackRef);
  const out = await settlePayment(db, {
    reference: v.reference,
    status: v.status,
    amount: v.amount,
    currency: v.currency,
    channel: v.channel,
    paidAt: v.paid_at,
  });
  await afterSettle(db, out);
  return out;
}
