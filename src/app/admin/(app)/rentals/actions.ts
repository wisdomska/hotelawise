'use server';
// Rental order, inventory and venue actions for the events desk.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { DESK_METHODS, ENQUIRY_STAGE, METHOD, RENTAL_STATUS, type EnquiryStage, type Method } from '@/lib/admin/labels';
import { formatGhs } from '@/lib/money';
import { act, AdminError, read } from '@/server/admin/act';
import {
  advanceOrder,
  cancelOrder,
  completeReturn,
  deleteOrder,
  moveOrderBack,
  orderDetail,
  recordOrderPayment,
  saveItem,
  sendQuote,
  setEnquiryNote,
  setEnquiryStage,
  setItemImage,
  setOrderNote,
  setRepair,
  enquiries,
} from '@/server/admin/rentals';
import { issueRefund } from '@/server/admin/refunds';
import * as s from '@/server/db/schema';

const ref = z.string().regex(/^AWR-[A-Z0-9]{3,8}$/);
const eref = z.string().regex(/^EQ-[A-Z0-9]{3,8}$/);
const method = z.enum(DESK_METHODS as [Method, ...Method[]]);
const cedis = (v: string) => Math.round(Number(String(v).replace(/[^\d.]/g, '')) * 100);

export async function loadOrder(r: string) {
  if (!ref.safeParse(r).success) return null;
  return read('rentals.view', async (d, who) => {
    const o = await orderDetail(d, r);
    return o ? { ...o, isSuper: who.isSuper } : null;
  });
}

export async function advanceOrderAction(r: string) {
  return act('rentals.status', async (tx, who) => {
    const { to } = await advanceOrder(tx, who, ref.parse(r));
    return done(`${r}: ${RENTAL_STATUS[to]}.`, 'Customer notified by SMS.');
  });
}

export async function orderBackAction(r: string, reason: string) {
  return act('rentals.status', async (tx, who) => {
    const { to } = await moveOrderBack(tx, who, ref.parse(r), reason.slice(0, 300));
    return done(`${r} moved back.`, `Now "${RENTAL_STATUS[to]}".`);
  });
}

export async function orderPaymentAction(raw: { ref: string; method: string; txn: string; password: string }) {
  const m = method.parse(raw.method);
  if (m !== 'cash' && raw.txn.trim().length < 4)
    return { ok: false as const, error: 'Enter the transaction ID.', fields: { txn: 'Enter the transaction ID.' } };
  return act(
    'rentals.payment.desk',
    async (tx, who) => {
      const out = await recordOrderPayment(tx, who, { ref: ref.parse(raw.ref), method: m, txn: raw.txn.trim() });
      return done('Payment recorded.', `${formatGhs(out.amount)} · ${METHOD[m]}`);
    },
    { password: raw.password },
  );
}

export async function returnChecklistAction(raw: {
  ref: string;
  rows: { itemId: string; back: number; damaged: number }[];
  password: string;
}) {
  const rows = z
    .array(z.object({ itemId: z.string().uuid(), back: z.number().int().min(0), damaged: z.number().int().min(0) }))
    .max(50)
    .parse(raw.rows);
  // Super Admins refund on the spot, so they confirm their password; staff only submit for approval.
  return act(
    'rentals.checklist',
    async (tx, who) => {
      const { isSuper } = (await read('rentals.checklist', async (_d, w) => w))!;
      const out = await completeReturn(tx, { ...who, isSuper }, { ref: ref.parse(raw.ref), rows });
      if (isSuper)
        return done(
          'Order completed.',
          out.failed
            ? `Paystack couldn’t send ${formatGhs(out.failed)}; pay that back by hand.`
            : out.refund
              ? `${formatGhs(out.refund)} refunded to the customer.`
              : 'No deposit to refund.',
        );
      return done('Checklist submitted.', out.refund ? `Refund of ${formatGhs(out.refund)} sent for approval.` : 'No deposit to refund.');
    },
    raw.password ? { password: raw.password } : {},
  );
}

export async function cancelOrderAction(r: string) {
  return act('rentals.status', async (tx, who) => {
    const out = await cancelOrder(tx, who, ref.parse(r));
    return done(
      `${r} cancelled.`,
      out.paid ? `They paid ${formatGhs(out.paid)}. Refund it from the order if needed.` : 'The items go back into stock.',
    );
  });
}

export async function deleteOrderAction(r: string) {
  return act('rentals.delete', async (tx, who) => {
    await deleteOrder(tx, who, ref.parse(r));
    return done(`${r} deleted.`);
  });
}

export async function saveOrderNote(r: string, note: string) {
  return act('rentals.status', async (tx, who) => {
    await setOrderNote(tx, who, ref.parse(r), note.slice(0, 2000));
    return done('Note saved.');
  });
}

export async function refundOrderAction(raw: { ref: string; amount: string; reason: string; password: string }) {
  const amount = cedis(raw.amount);
  if (!(amount > 0)) return { ok: false as const, error: 'Enter an amount above 0.', fields: { amount: 'Enter an amount above 0.' } };
  return act(
    'rentals.refund',
    async (tx, who) => {
      const r = ref.parse(raw.ref);
      const [o] = await tx
        .select({ id: s.rentalOrders.id, who: s.rentalOrders.collectorName })
        .from(s.rentalOrders)
        .where(eq(s.rentalOrders.ref, r));
      if (!o) throw new AdminError('That order no longer exists.');
      try {
        const out = await issueRefund(tx, who, {
          target: { orderId: o.id },
          label: `${r} · ${o.who}`,
          amount,
          reason: raw.reason.slice(0, 120),
        });
        return done(
          'Refund issued.',
          out.failed ? `Paystack couldn’t send ${formatGhs(out.failed)}; pay it back by hand.` : `${formatGhs(amount)} on its way back.`,
        );
      } catch (e) {
        if (e instanceof Error && e.name === 'RefundError') throw new AdminError(e.message, { amount: e.message });
        throw e;
      }
    },
    { password: raw.password },
  );
}

/* ── inventory ── */

export async function repairAction(itemId: string, delta: 1 | -1) {
  return act(
    'inventory.repair',
    async (tx, who) => {
      const { name } = await setRepair(tx, who, z.string().uuid().parse(itemId), delta);
      return done(delta > 0 ? `1 ${name.toLowerCase()} sent for repair.` : `1 ${name.toLowerCase()} back in stock.`);
    },
    { site: true },
  );
}

export async function saveItemAction(raw: {
  id: string | null;
  name: string;
  spec: string;
  price: string;
  deposit: string;
  stock: string;
}) {
  const errs: Record<string, string> = {};
  if (raw.name.trim().length < 2) errs.name = 'Give the item a name.';
  const price = cedis(raw.price);
  const deposit = cedis(raw.deposit);
  const stock = Math.floor(Number(raw.stock));
  if (!(price > 0)) errs.price = 'Price must be more than 0.';
  if (raw.deposit.trim() === '' || !(deposit >= 0)) errs.deposit = 'Enter a number.';
  if (raw.stock.trim() === '' || !(stock >= 0)) errs.stock = 'Enter a number.';
  if (Object.keys(errs).length) return { ok: false as const, error: 'Check the highlighted fields.', fields: errs };
  return act(
    'inventory.edit',
    async (tx, who) => {
      const out = await saveItem(tx, who, {
        id: raw.id,
        name: raw.name.trim(),
        spec: raw.spec.trim().slice(0, 120),
        price,
        deposit,
        stock,
      });
      return out.created
        ? done(`${raw.name.trim()} added.`, 'It’s on the rentals page now.')
        : done('Item saved.', 'Live on the rentals page.');
    },
    { site: true },
  );
}

export async function setItemImageAction(itemId: string, imageId: string) {
  return act(
    'inventory.edit',
    async (tx, who) => {
      const { name } = await setItemImage(tx, who, z.string().uuid().parse(itemId), z.string().max(200).parse(imageId));
      return done('Photo updated.', `${name} on the rentals page.`);
    },
    { site: true },
  );
}

/* ── venues ── */

export async function loadEnquiry(r: string) {
  if (!eref.safeParse(r).success) return null;
  return read('venues.view', async (d) => (await enquiries(d)).find((e) => e.ref === r) ?? null);
}

export async function enquiryStageAction(r: string, to: string, reason?: string) {
  const stage = z.enum(['new', 'quoted', 'deposit_paid', 'done', 'lost']).parse(to) as EnquiryStage;
  return act('venues.pipeline', async (tx, who) => {
    await setEnquiryStage(tx, who, eref.parse(r), stage, reason?.slice(0, 300));
    return done(`${r}: ${ENQUIRY_STAGE[stage]}.`);
  });
}

export async function sendQuoteAction(raw: { ref: string; lines: { label: string; qty: number; unit: number }[] }) {
  const lines = z
    .array(z.object({ label: z.string().max(80), qty: z.number().int().min(0).max(5000), unit: z.number().int().min(0).max(100_000_000) }))
    .max(20)
    .parse(raw.lines);
  return act('venues.quote', async (tx, who) => {
    const { total } = await sendQuote(tx, who, { ref: eref.parse(raw.ref), lines });
    return done('Quote saved.', `${formatGhs(total)}. Call or WhatsApp the customer with it.`);
  });
}

export async function saveEnquiryNote(r: string, note: string) {
  return act('venues.pipeline', async (tx, who) => {
    await setEnquiryNote(tx, who, eref.parse(r), note.slice(0, 2000));
    return done('Note saved.');
  });
}
