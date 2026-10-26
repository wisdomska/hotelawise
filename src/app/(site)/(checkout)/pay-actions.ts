'use server';
// Payment status for the booking and rental pages: asks Paystack (through the
// same settle path the webhook uses) and reports where the guest goes next.
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { failureReason, PaystackError, submitOtp } from '@/server/integrations/paystack';
import { db, withTransactionDb } from '@/server/platform/db';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';
import { checkAndSettle } from '@/server/services/payment-flow';

export type PayState =
  { state: 'pending' } | { state: 'confirmed'; href: string } | { state: 'failed'; error: string } | { state: 'refunded'; error: string };

const PAY_REF = /^AWP-[A-Z0-9]{4,16}$/;
const STILL_GOING = new Set(['pending', 'ongoing', 'processing', 'queued', 'send_otp', 'pay_offline']);

async function hrefFor(kind: 'booking' | 'order', id: string): Promise<string | null> {
  const d = await db();
  if (kind === 'booking') {
    const [b] = await d.select({ t: schema.bookings.publicToken }).from(schema.bookings).where(eq(schema.bookings.id, id));
    return b ? `/book/confirmation/${b.t}` : null;
  }
  const [o] = await d.select({ t: schema.rentalOrders.publicToken }).from(schema.rentalOrders).where(eq(schema.rentalOrders.id, id));
  return o ? `/rent/confirmation/${o.t}` : null;
}

export async function paymentState(payRef: string, method: 'momo' | 'card'): Promise<PayState> {
  if (!PAY_REF.test(payRef)) return { state: 'failed', error: 'Payment not found.' };
  if (!(await allow('paymentStatus', await clientIp()))) return { state: 'pending' };
  try {
    const out = await withTransactionDb((tx) => checkAndSettle(tx, payRef));
    const target =
      out.kind === 'confirmed' || out.kind === 'already'
        ? await hrefFor('booking', out.bookingId)
        : out.kind === 'order_confirmed' || out.kind === 'order_already'
          ? await hrefFor('order', out.orderId)
          : null;
    if (target) return { state: 'confirmed', href: target };
    if (out.kind === 'refund' || out.kind === 'order_refund') {
      return { state: 'refunded', error: 'It went while the payment was on its way, so we’ve refunded you in full.' };
    }
    if ((out.kind === 'failed' || out.kind === 'order_failed') && !STILL_GOING.has(out.reason)) {
      return { state: 'failed', error: failureReason(out.reason, method) };
    }
    return { state: 'pending' };
  } catch (e) {
    if (e instanceof PaystackError) return { state: 'pending' };
    throw e;
  }
}

/** Telecel Cash: the voucher code the payer generated on their phone. */
export async function sendMomoCode(payRef: string, otp: string): Promise<{ ok: true; display: string } | { ok: false; error: string }> {
  if (!PAY_REF.test(payRef) || !/^\d{4,8}$/.test(otp.trim())) return { ok: false, error: 'Enter the code from your phone.' };
  if (!(await allow('payment', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a few minutes.' };
  try {
    const c = await submitOtp(payRef, otp.trim());
    if (c.status === 'failed') return { ok: false, error: failureReason(c.gateway_response, 'momo') };
    return { ok: true, display: c.display_text || 'Approve the payment on your phone.' };
  } catch {
    return { ok: false, error: 'That code didn’t work. Check it and try again.' };
  }
}
