// Refunds from the admin. Super Admins refund directly; staff requests wait in
// Payments › Refunds for approval. Money paid through Paystack goes back
// through Paystack; desk payments (cash, MoMo at the desk, POS) are paid back
// by hand and recorded as such. Each refund is logged.
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { formatGhs } from '@/lib/money';
import * as s from '@/server/db/schema';
import { refundTransaction } from '@/server/integrations/paystack';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { refundedFor, type Who } from './bookings';

export class RefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundError';
  }
}

type Target = { bookingId: string } | { orderId: string };
type Planned = { id: string; paystackRef: string | null; amount: number };

/** Splits an amount across the target's successful payments, newest first, and records the refund rows. */
async function plan(
  tx: AnyDb,
  target: Target,
  amount: number,
  reason: string,
  status: 'pending_approval' | 'processing',
  by: Who,
  approved: boolean,
) {
  // Lock the booking or order first, so two refunds at the same moment can't both
  // see the same "left to refund" and together pay back more than was paid.
  if ('bookingId' in target)
    await tx.select({ id: s.bookings.id }).from(s.bookings).where(eq(s.bookings.id, target.bookingId)).for('update');
  else await tx.select({ id: s.rentalOrders.id }).from(s.rentalOrders).where(eq(s.rentalOrders.id, target.orderId)).for('update');
  const where = 'bookingId' in target ? eq(s.payments.bookingId, target.bookingId) : eq(s.payments.orderId, target.orderId);
  const pays = await tx
    .select({ id: s.payments.id, amount: s.payments.amountPesewas, channel: s.payments.channel, paystackRef: s.payments.paystackRef })
    .from(s.payments)
    .where(and(where, eq(s.payments.status, 'success')))
    .orderBy(desc(s.payments.createdAt));
  const paid = pays.reduce((t, p) => t + p.amount, 0);
  const left = paid - (await refundedFor(tx, target));
  if (amount <= 0) throw new RefundError('Enter an amount above 0.');
  if (amount > left) throw new RefundError(`You can refund up to ${formatGhs(left)}.`);
  const out: Planned[] = [];
  let rest = amount;
  for (const p of pays) {
    if (rest <= 0) break;
    const already = await tx
      .select({ a: s.refunds.amountPesewas })
      .from(s.refunds)
      .where(
        and(eq(s.refunds.paymentId, p.id), inArray(s.refunds.status, ['pending_approval', 'processing', 'refunded', 'manual_refunded'])),
      );
    const room = p.amount - already.reduce((t, r) => t + r.a, 0);
    if (room <= 0) continue;
    const take = Math.min(room, rest);
    const desk = p.channel === 'desk';
    const [r] = await tx
      .insert(s.refunds)
      .values({
        paymentId: p.id,
        amountPesewas: take,
        reason,
        status: status === 'pending_approval' ? 'pending_approval' : desk ? 'manual_refunded' : 'processing',
        requestedBy: by.id,
        approvedBy: approved ? by.id : null,
      })
      .returning({ id: s.refunds.id });
    if (!desk && status === 'processing') out.push({ id: r!.id, paystackRef: p.paystackRef, amount: take });
    rest -= take;
  }
  return out;
}

/** Calls Paystack for the online part, after the rows are committed. */
async function sendToPaystack(db: AnyDb, planned: Planned[], note: string) {
  let failed = 0;
  for (const p of planned) {
    let status: 'refunded' | 'failed' = 'failed';
    let id: string | null = null;
    if (p.paystackRef) {
      try {
        const r = await refundTransaction(p.paystackRef, p.amount, note);
        status = 'refunded';
        id = String(r.id);
      } catch (e) {
        console.error('paystack refund failed', e);
      }
    }
    if (status === 'failed') failed += p.amount;
    await db.update(s.refunds).set({ status, paystackRefundId: id }).where(eq(s.refunds.id, p.id));
  }
  return failed;
}

async function settlePaymentStatus(tx: AnyDb, target: Target) {
  if (!('bookingId' in target)) return;
  const [b] = await tx.select({ paid: s.bookings.paidPesewas }).from(s.bookings).where(eq(s.bookings.id, target.bookingId));
  const back = await refundedFor(tx, target);
  if (!b || back <= 0) return;
  await tx
    .update(s.bookings)
    .set({ paymentStatus: back >= b.paid ? 'refunded' : 'partially_refunded' })
    .where(eq(s.bookings.id, target.bookingId));
}

/** A Super Admin refunds straight away. Returns how much Paystack refused (to do by hand). */
export async function issueRefund(db: AnyDb, by: Who, input: { target: Target; label: string; amount: number; reason: string }) {
  const planned = await db.transaction(async (tx) => {
    const p = await plan(tx, input.target, input.amount, input.reason, 'processing', by, true);
    await settlePaymentStatus(tx, input.target);
    await audit(tx, {
      actor: by,
      action: 'Issued refund',
      entity: 'bookingId' in input.target ? 'booking' : 'rental_order',
      entityId: 'bookingId' in input.target ? input.target.bookingId : input.target.orderId,
      target: input.label,
      after: { amount: formatGhs(input.amount), reason: input.reason },
    });
    return p;
  });
  return { failed: await sendToPaystack(db, planned, input.reason) };
}

/** Staff (or the return checklist) asks; a Super Admin approves later. */
export async function requestRefund(db: AnyDb, by: Who, input: { target: Target; label: string; amount: number; reason: string }) {
  return db.transaction(async (tx) => {
    await plan(tx, input.target, input.amount, input.reason, 'pending_approval', by, false);
    await audit(tx, {
      actor: by,
      action: 'Requested refund',
      entity: 'bookingId' in input.target ? 'booking' : 'rental_order',
      entityId: 'bookingId' in input.target ? input.target.bookingId : input.target.orderId,
      target: input.label,
      after: { amount: formatGhs(input.amount), reason: input.reason },
    });
  });
}

export async function approveRefund(db: AnyDb, by: Who, refundId: string) {
  const planned = await db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        r: s.refunds,
        channel: s.payments.channel,
        paystackRef: s.payments.paystackRef,
        bookingId: s.payments.bookingId,
        orderId: s.payments.orderId,
      })
      .from(s.refunds)
      .innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
      .where(eq(s.refunds.id, refundId))
      .for('update', { of: s.refunds });
    if (!r) throw new RefundError('That refund no longer exists.');
    if (r.r.status !== 'pending_approval') throw new RefundError('Someone has already dealt with this refund.');
    const desk = r.channel === 'desk';
    await tx
      .update(s.refunds)
      .set({ status: desk ? 'manual_refunded' : 'processing', approvedBy: by.id })
      .where(eq(s.refunds.id, refundId));
    // A rental's deposit refund approved: the order is finished.
    if (r.orderId)
      await tx
        .update(s.rentalOrders)
        .set({ status: 'completed' })
        .where(and(eq(s.rentalOrders.id, r.orderId), eq(s.rentalOrders.status, 'returned')));
    if (r.bookingId) await settlePaymentStatus(tx, { bookingId: r.bookingId });
    await audit(tx, {
      actor: by,
      action: 'Approved refund',
      entity: 'refund',
      entityId: refundId,
      after: { amount: formatGhs(r.r.amountPesewas), reason: r.r.reason },
    });
    return desk ? [] : [{ id: refundId, paystackRef: r.paystackRef, amount: r.r.amountPesewas }];
  });
  return { failed: await sendToPaystack(db, planned, 'Refund approved by Hotel A-Wise') };
}

export async function rejectRefund(db: AnyDb, by: Who, refundId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(s.refunds).where(eq(s.refunds.id, refundId)).for('update');
    if (!r) throw new RefundError('That refund no longer exists.');
    if (r.status !== 'pending_approval') throw new RefundError('Someone has already dealt with this refund.');
    await tx.update(s.refunds).set({ status: 'rejected', approvedBy: by.id }).where(eq(s.refunds.id, refundId));
    await audit(tx, {
      actor: by,
      action: 'Rejected refund',
      entity: 'refund',
      entityId: refundId,
      before: { status: 'Pending approval' },
      after: { status: 'Rejected', amount: formatGhs(r.amountPesewas) },
    });
  });
}
