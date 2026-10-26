// Rental orders, inventory and venue enquiries as the events desk works them:
// lists, board, calendar, the order drawer, status moves (with a reason when
// going back), payment at pickup, the return checklist and its deposit refund.
import 'server-only';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { addDays, todayInAccra, type IsoDate } from '@/lib/dates';
import { ENQUIRY_STAGE, METHOD, RENTAL_STATUS, type EnquiryStage, type Method, type RentalStatus } from '@/lib/admin/labels';
import { formatGhs } from '@/lib/money';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { rentalDays } from '@/server/services/rentals';
import { BookingStateError, insertDeskPayment, refundedFor, type Who } from './bookings';
import { issueRefund, requestRefund } from './refunds';

export type OrderRow = {
  id: string;
  ref: string;
  who: string;
  phone: string;
  occasion: string;
  starts: IsoDate;
  ends: IsoDate;
  days: number;
  items: { name: string; qty: number }[];
  payMode: 'online' | 'at_pickup';
  status: RentalStatus;
  total: number;
  paid: number;
  deposit: number;
  discount: number;
};

async function withItems(db: AnyDb, orders: (typeof s.rentalOrders.$inferSelect)[]): Promise<OrderRow[]> {
  if (!orders.length) return [];
  const lines = await db
    .select({ orderId: s.orderLines.orderId, name: s.rentalItems.name, qty: s.orderLines.qty })
    .from(s.orderLines)
    .innerJoin(s.rentalItems, eq(s.rentalItems.id, s.orderLines.itemId))
    .where(
      inArray(
        s.orderLines.orderId,
        orders.map((o) => o.id),
      ),
    )
    .orderBy(asc(s.rentalItems.position));
  return orders.map((o) => ({
    id: o.id,
    ref: o.ref,
    who: o.collectorName,
    phone: o.collectorPhoneE164,
    occasion: o.occasion,
    starts: o.starts,
    ends: o.ends,
    days: rentalDays(o.starts, o.ends),
    items: lines.filter((l) => l.orderId === o.id).map((l) => ({ name: l.name, qty: l.qty })),
    payMode: o.payMode,
    status: o.status,
    total: o.totalPesewas,
    paid: o.paidPesewas,
    deposit: o.depositPesewas,
    discount: o.discountPesewas,
  }));
}

export const ORDER_PAGE = 8;

export async function listOrders(db: AnyDb, opts: { status?: RentalStatus; page: number }) {
  const where = opts.status ? eq(s.rentalOrders.status, opts.status) : undefined;
  const [orders, [{ n } = { n: 0 }], counts] = await Promise.all([
    db
      .select()
      .from(s.rentalOrders)
      .where(where)
      .orderBy(asc(s.rentalOrders.starts), asc(s.rentalOrders.ref))
      .limit(ORDER_PAGE)
      .offset(Math.max(0, opts.page) * ORDER_PAGE),
    db.select({ n: count() }).from(s.rentalOrders).where(where),
    db.select({ status: s.rentalOrders.status, n: count() }).from(s.rentalOrders).groupBy(s.rentalOrders.status),
  ]);
  return {
    rows: await withItems(db, orders),
    total: Number(n),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<RentalStatus, number>>,
  };
}

/** The board's lanes: everything not finished, plus the last returns waiting on a refund. */
export async function boardOrders(db: AnyDb) {
  const orders = await db
    .select()
    .from(s.rentalOrders)
    .where(inArray(s.rentalOrders.status, ['pending_payment', 'reserved', 'ready_for_pickup', 'collected', 'returned']))
    .orderBy(asc(s.rentalOrders.starts))
    .limit(200);
  return withItems(db, orders);
}

export async function ordersBetween(db: AnyDb, from: IsoDate, days = 14) {
  const to = addDays(from, days);
  const orders = await db
    .select()
    .from(s.rentalOrders)
    .where(and(ne(s.rentalOrders.status, 'cancelled'), sql`${s.rentalOrders.starts} < ${to}`, sql`${s.rentalOrders.ends} + 1 >= ${from}`))
    .orderBy(asc(s.rentalOrders.starts));
  return withItems(db, orders);
}

/** Pickups today, and returns due today. */
export async function pickupsAndReturns(db: AnyDb, today: IsoDate) {
  const orders = await db
    .select()
    .from(s.rentalOrders)
    .where(
      sql`(${s.rentalOrders.starts} = ${today} and ${s.rentalOrders.status} in ('reserved','ready_for_pickup','collected'))
        or (${s.rentalOrders.ends} + 1 = ${today}::date and ${s.rentalOrders.status} = 'collected')`,
    )
    .orderBy(asc(s.rentalOrders.ref));
  return withItems(db, orders);
}

export type OrderDetail = OrderRow & {
  email: string | null;
  notes: string;
  lines: { name: string; qty: number; amount: number; deposit: number; itemId: string }[];
  method: string | null;
  refunded: number;
  refundable: number;
  returned: { deduction: number; refund: number } | null;
  refundPending: boolean;
};

export async function orderDetail(db: AnyDb, ref: string): Promise<OrderDetail | null> {
  const [o] = await db.select().from(s.rentalOrders).where(eq(s.rentalOrders.ref, ref));
  if (!o) return null;
  const [row] = await withItems(db, [o]);
  const [cust, lines, pays, back, check, pending] = await Promise.all([
    db.select({ email: s.customers.email }).from(s.customers).where(eq(s.customers.id, o.customerId)),
    db
      .select({
        itemId: s.orderLines.itemId,
        name: s.rentalItems.name,
        qty: s.orderLines.qty,
        unit: s.orderLines.unitPesewas,
        days: s.orderLines.days,
        dep: s.orderLines.depositPesewas,
      })
      .from(s.orderLines)
      .innerJoin(s.rentalItems, eq(s.rentalItems.id, s.orderLines.itemId))
      .where(eq(s.orderLines.orderId, o.id))
      .orderBy(asc(s.rentalItems.position)),
    db
      .select({ method: s.payments.method, amount: s.payments.amountPesewas })
      .from(s.payments)
      .where(and(eq(s.payments.orderId, o.id), eq(s.payments.status, 'success')))
      .orderBy(desc(s.payments.createdAt)),
    refundedFor(db, { orderId: o.id }),
    db.select().from(s.returnChecklists).where(eq(s.returnChecklists.orderId, o.id)),
    db
      .select({ n: count() })
      .from(s.refunds)
      .innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
      .where(and(eq(s.payments.orderId, o.id), eq(s.refunds.status, 'pending_approval'))),
  ]);
  const paidIn = pays.reduce((t, p) => t + p.amount, 0);
  return {
    ...row!,
    email: cust[0]?.email ?? null,
    notes: o.notes,
    lines: lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, amount: l.qty * l.unit * l.days, deposit: l.dep })),
    method: pays[0]?.method ? METHOD[pays[0].method as Method] : null,
    refunded: back,
    refundable: Math.max(0, paidIn - back),
    returned: check[0] ? { deduction: check[0].deductionPesewas, refund: check[0].refundPesewas } : null,
    refundPending: Number(pending[0]?.n ?? 0) > 0,
  };
}

async function lockOrder(tx: AnyDb, ref: string) {
  const [o] = await tx.select().from(s.rentalOrders).where(eq(s.rentalOrders.ref, ref)).for('update');
  if (!o) throw new BookingStateError('That order no longer exists.');
  return o;
}

const FLOW: RentalStatus[] = ['pending_payment', 'reserved', 'ready_for_pickup', 'collected', 'returned', 'completed'];
export const NEXT_STATUS: Partial<Record<RentalStatus, RentalStatus>> = {
  reserved: 'ready_for_pickup',
  ready_for_pickup: 'collected',
};
export const PREV_STATUS: Partial<Record<RentalStatus, RentalStatus>> = {
  ready_for_pickup: 'reserved',
  collected: 'ready_for_pickup',
  returned: 'collected',
};

async function logStatus(
  tx: AnyDb,
  by: Who,
  o: { id: string; ref: string; collectorName: string },
  from: RentalStatus,
  to: RentalStatus,
  reason?: string,
) {
  await tx.insert(s.orderStatusEvents).values({ orderId: o.id, from, to, reason: reason ?? null, byUserId: by.id });
  await audit(tx, {
    actor: by,
    action: reason ? 'Moved back' : 'Order status',
    entity: 'rental_order',
    entityId: o.id,
    target: `${o.ref} · ${o.collectorName}`,
    before: { status: RENTAL_STATUS[from] },
    after: { status: RENTAL_STATUS[to], ...(reason ? { reason } : {}) },
  });
}

export async function advanceOrder(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, ref);
    const to = NEXT_STATUS[o.status];
    if (!to) throw new BookingStateError(`${RENTAL_STATUS[o.status]} orders can’t move forward from here.`);
    if (to === 'collected' && o.paidPesewas < o.totalPesewas)
      throw new BookingStateError(`${formatGhs(o.totalPesewas - o.paidPesewas)} is due before handover. Take payment first.`);
    await tx.update(s.rentalOrders).set({ status: to, holdUntil: null }).where(eq(s.rentalOrders.id, o.id));
    await logStatus(tx, by, o, o.status, to);
    return { to };
  });
}

export async function moveOrderBack(db: AnyDb, by: Who, ref: string, reason: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, ref);
    const to = PREV_STATUS[o.status];
    if (!to) throw new BookingStateError('This order can’t move back.');
    if (o.status === 'returned') {
      // Undo a return: drop the checklist and its refund request.
      const pend = await tx
        .select({ id: s.refunds.id })
        .from(s.refunds)
        .innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
        .where(and(eq(s.payments.orderId, o.id), eq(s.refunds.status, 'pending_approval')));
      if (pend.length)
        await tx.delete(s.refunds).where(
          inArray(
            s.refunds.id,
            pend.map((p) => p.id),
          ),
        );
      await tx.delete(s.returnChecklists).where(eq(s.returnChecklists.orderId, o.id));
    }
    await tx.update(s.rentalOrders).set({ status: to }).where(eq(s.rentalOrders.id, o.id));
    await logStatus(tx, by, o, o.status, to, reason);
    return { to };
  });
}

/** Takes the balance at the desk (pay-at-pickup orders, or a failed online payment). */
export async function recordOrderPayment(db: AnyDb, by: Who, input: { ref: string; method: Method; txn: string }, now = new Date()) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, input.ref);
    if (['cancelled', 'completed'].includes(o.status))
      throw new BookingStateError(`This order is ${RENTAL_STATUS[o.status].toLowerCase()}.`);
    const due = o.totalPesewas - o.paidPesewas;
    if (due <= 0) throw new BookingStateError('This order is already paid.');
    await insertDeskPayment(tx, by, { orderId: o.id }, due, { method: input.method, txn: input.txn }, now);
    const status: RentalStatus = o.status === 'pending_payment' ? 'reserved' : o.status;
    await tx.update(s.rentalOrders).set({ paidPesewas: o.totalPesewas, status, holdUntil: null }).where(eq(s.rentalOrders.id, o.id));
    await audit(tx, {
      actor: by,
      action: 'Recorded payment',
      entity: 'rental_order',
      entityId: o.id,
      target: `${o.ref} · ${o.collectorName}`,
      before: { paid: formatGhs(o.paidPesewas) },
      after: { paid: formatGhs(o.totalPesewas), method: METHOD[input.method] },
    });
    return { amount: due, status };
  });
}

export async function cancelOrder(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, ref);
    if (!['pending_payment', 'reserved', 'ready_for_pickup'].includes(o.status))
      throw new BookingStateError('Only orders not yet collected can be cancelled.');
    await tx.update(s.rentalOrders).set({ status: 'cancelled', holdUntil: null }).where(eq(s.rentalOrders.id, o.id));
    await logStatus(tx, by, o, o.status, 'cancelled');
    return { paid: o.paidPesewas, who: o.collectorName };
  });
}

export async function deleteOrder(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, ref);
    const [p] = await tx.select({ n: count() }).from(s.payments).where(eq(s.payments.orderId, o.id));
    if (Number(p?.n ?? 0) > 0)
      throw new BookingStateError('This order has payments on record. Cancel it (and refund) instead, so the money stays traceable.');
    await tx.delete(s.rentalOrders).where(eq(s.rentalOrders.id, o.id));
    await audit(tx, {
      actor: by,
      action: 'Deleted rental order',
      entity: 'rental_order',
      entityId: o.id,
      target: `${o.ref} · ${o.collectorName}`,
    });
  });
}

export async function setOrderNote(db: AnyDb, by: Who, ref: string, note: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, ref);
    await tx.update(s.rentalOrders).set({ notes: note }).where(eq(s.rentalOrders.id, o.id));
    await audit(tx, { actor: by, action: 'Edited staff note', entity: 'rental_order', entityId: o.id, target: o.ref });
  });
}

/**
 * The return checklist: count what came back and what's damaged with the
 * customer present. Missing or damaged units cost their deposit; the rest of
 * the deposit goes back. Super Admins refund straight away; staff send it for
 * approval.
 */
export async function completeReturn(
  db: AnyDb,
  by: Who & { isSuper: boolean },
  input: { ref: string; rows: { itemId: string; back: number; damaged: number }[] },
) {
  const res = await db.transaction(async (tx) => {
    const o = await lockOrder(tx, input.ref);
    if (o.status !== 'collected') throw new BookingStateError('Only collected orders can be checked back in.');
    const lines = await tx
      .select({ itemId: s.orderLines.itemId, qty: s.orderLines.qty, dep: s.orderLines.depositPesewas })
      .from(s.orderLines)
      .where(eq(s.orderLines.orderId, o.id));
    let deduction = 0;
    const record = lines.map((l) => {
      const r = input.rows.find((x) => x.itemId === l.itemId) ?? { back: l.qty, damaged: 0 };
      const back = Math.max(0, Math.min(l.qty, Math.floor(r.back)));
      const damaged = Math.max(0, Math.min(back, Math.floor(r.damaged)));
      const missing = l.qty - back;
      deduction += (missing + damaged) * l.dep;
      return { itemId: l.itemId, returned: back, damaged, missing };
    });
    const paidDeposit = Math.min(o.depositPesewas, o.paidPesewas);
    const refund = Math.max(0, paidDeposit - deduction);
    await tx.insert(s.returnChecklists).values({
      orderId: o.id,
      byUserId: by.id,
      lines: record,
      deductionPesewas: deduction,
      refundPesewas: refund,
      approvedBy: by.isSuper ? by.id : null,
    });
    // Damaged units go to repair.
    for (const r of record)
      if (r.damaged)
        await tx
          .update(s.rentalItems)
          .set({ unitsInRepair: sql`least(${s.rentalItems.stockTotal}, ${s.rentalItems.unitsInRepair} + ${r.damaged})` })
          .where(eq(s.rentalItems.id, r.itemId));
    const to: RentalStatus = by.isSuper || refund === 0 ? 'completed' : 'returned';
    await tx.update(s.rentalOrders).set({ status: to }).where(eq(s.rentalOrders.id, o.id));
    await logStatus(tx, by, o, 'collected', to);
    return { order: o, refund, deduction, to };
  });
  let failed = 0;
  if (res.refund > 0) {
    const label = `${res.order.ref} · ${res.order.collectorName}`;
    const reason = res.deduction ? `Deposit return (${formatGhs(res.deduction)} deducted)` : 'Deposit return';
    if (by.isSuper) failed = (await issueRefund(db, by, { target: { orderId: res.order.id }, label, amount: res.refund, reason })).failed;
    else await requestRefund(db, by, { target: { orderId: res.order.id }, label, amount: res.refund, reason });
  }
  return { refund: res.refund, deduction: res.deduction, to: res.to, failed };
}

/* ───────────── inventory ───────────── */

export type ItemRow = {
  id: string;
  slug: string;
  name: string;
  spec: string;
  imageId: string | null;
  price: number;
  deposit: number;
  stock: number;
  repair: number;
  outToday: number;
  archived: boolean;
};

export async function itemsWithToday(db: AnyDb, today: IsoDate): Promise<ItemRow[]> {
  const items = await db.select().from(s.rentalItems).where(eq(s.rentalItems.archived, false)).orderBy(asc(s.rentalItems.position));
  const out = await unitsOut(db, today, today);
  return items.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    spec: i.spec,
    imageId: i.imageId,
    price: i.pricePerDayPesewas,
    deposit: i.depositPerUnitPesewas,
    stock: i.stockTotal,
    repair: i.unitsInRepair,
    outToday: out.get(`${i.id}|${today}`) ?? 0,
    archived: i.archived,
  }));
}

/** Units on orders per item per day across [from, to] (pickup to the day after the event). */
export async function unitsOut(db: AnyDb, from: IsoDate, to: IsoDate, now = new Date()) {
  const rows = await db.execute(sql`
    select l.item_id, d::date::text as day, sum(l.qty)::int as qty
      from order_lines l
      join rental_orders o on o.id = l.order_id
      cross join generate_series(${from}::date, ${to}::date, interval '1 day') d
     where o.status not in ('cancelled', 'returned', 'completed')
       and not (o.status in ('pending_payment', 'reserved') and o.hold_until is not null and o.hold_until <= ${now.toISOString()})
       and d::date between o.starts and o.ends + 1
     group by l.item_id, d`);
  const map = new Map<string, number>();
  for (const r of rowsOf<{ item_id: string; day: string; qty: number }>(rows)) map.set(`${r.item_id}|${r.day}`, r.qty);
  return map;
}

export async function setRepair(db: AnyDb, by: Who, itemId: string, delta: 1 | -1) {
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(s.rentalItems).where(eq(s.rentalItems.id, itemId)).for('update');
    if (!i) throw new BookingStateError('That item no longer exists.');
    const next = i.unitsInRepair + delta;
    if (next < 0 || next > i.stockTotal) throw new BookingStateError('Nothing to change.');
    if (delta > 0) {
      const today = todayInAccra();
      const out = (await unitsOut(tx, today, today)).get(`${i.id}|${today}`) ?? 0;
      if (i.stockTotal - i.unitsInRepair - out <= 0)
        throw new BookingStateError(`No free ${i.name.toLowerCase()} to send for repair today.`);
    }
    await tx.update(s.rentalItems).set({ unitsInRepair: next }).where(eq(s.rentalItems.id, i.id));
    await audit(tx, {
      actor: by,
      action: delta > 0 ? 'Sent for repair' : 'Back from repair',
      entity: 'rental_item',
      entityId: i.id,
      target: i.name,
      before: { repair: i.unitsInRepair },
      after: { repair: next },
    });
    return { name: i.name };
  });
}

export async function saveItem(
  db: AnyDb,
  by: Who,
  input: { id: string | null; name: string; spec: string; price: number; deposit: number; stock: number },
) {
  return db.transaction(async (tx) => {
    if (input.id) {
      const [i] = await tx.select().from(s.rentalItems).where(eq(s.rentalItems.id, input.id)).for('update');
      if (!i) throw new BookingStateError('That item no longer exists.');
      if (input.stock < i.unitsInRepair) throw new BookingStateError(`${i.unitsInRepair} are in repair. Units owned can’t be fewer.`);
      await tx
        .update(s.rentalItems)
        .set({
          name: input.name,
          spec: input.spec,
          pricePerDayPesewas: input.price,
          depositPerUnitPesewas: input.deposit,
          stockTotal: input.stock,
        })
        .where(eq(s.rentalItems.id, i.id));
      await audit(tx, {
        actor: by,
        action: 'Edited item',
        entity: 'rental_item',
        entityId: i.id,
        target: input.name,
        before: { price: formatGhs(i.pricePerDayPesewas), deposit: formatGhs(i.depositPerUnitPesewas), stock: i.stockTotal },
        after: { price: formatGhs(input.price), deposit: formatGhs(input.deposit), stock: input.stock },
      });
      return { created: false };
    }
    const base =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'item';
    const slug = `${base}-${crypto.randomUUID().slice(0, 4)}`;
    const [{ max } = { max: 0 }] = await tx
      .select({ max: sql<number>`coalesce(max(${s.rentalItems.position}), 0)::int` })
      .from(s.rentalItems);
    const [row] = await tx
      .insert(s.rentalItems)
      .values({
        slug,
        name: input.name,
        spec: input.spec,
        pricePerDayPesewas: input.price,
        depositPerUnitPesewas: input.deposit,
        stockTotal: input.stock,
        isCustom: true,
        position: Number(max) + 1,
      })
      .returning({ id: s.rentalItems.id });
    await audit(tx, {
      actor: by,
      action: 'Added item',
      entity: 'rental_item',
      entityId: row!.id,
      target: input.name,
      after: { price: formatGhs(input.price), stock: input.stock },
    });
    return { created: true };
  });
}

export async function setItemImage(db: AnyDb, by: Who, itemId: string, imageId: string) {
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(s.rentalItems).where(eq(s.rentalItems.id, itemId));
    if (!i) throw new BookingStateError('That item no longer exists.');
    await tx.update(s.rentalItems).set({ imageId, imageAlt: i.name }).where(eq(s.rentalItems.id, i.id));
    await audit(tx, { actor: by, action: 'Changed item photo', entity: 'rental_item', entityId: i.id, target: i.name });
    return { name: i.name };
  });
}

/* ───────────── venue enquiries ───────────── */

export type EnquiryRow = {
  id: string;
  ref: string;
  who: string;
  phone: string;
  email: string | null;
  venue: string;
  venueSlug: string;
  date: IsoDate;
  guests: number;
  what: string;
  message: string;
  stage: EnquiryStage;
  quoteTotal: number | null;
  notes: string;
};

export async function enquiries(db: AnyDb, opts: { from?: IsoDate; upcomingOnly?: boolean; limit?: number } = {}): Promise<EnquiryRow[]> {
  const rows = await db
    .select({
      e: s.enquiries,
      who: s.customers.name,
      phone: s.customers.phoneE164,
      email: s.customers.email,
      venue: s.venues.name,
      venueSlug: s.venues.slug,
    })
    .from(s.enquiries)
    .innerJoin(s.customers, eq(s.customers.id, s.enquiries.customerId))
    .innerJoin(s.venues, eq(s.venues.id, s.enquiries.venueId))
    .where(
      opts.upcomingOnly
        ? and(
            sql`${s.enquiries.eventDate} >= ${opts.from ?? todayInAccra()}`,
            inArray(s.enquiries.stage, ['new', 'quoted', 'deposit_paid']),
          )
        : undefined,
    )
    .orderBy(asc(s.enquiries.eventDate))
    .limit(opts.limit ?? 300);
  return rows.map((r) => ({
    id: r.e.id,
    ref: r.e.ref,
    who: r.who,
    phone: r.phone,
    email: r.email,
    venue: r.venue,
    venueSlug: r.venueSlug,
    date: r.e.eventDate,
    guests: r.e.guests,
    what: r.e.eventType,
    message: r.e.message,
    stage: r.e.stage,
    quoteTotal: (r.e.quote as { totalPesewas?: number } | null)?.totalPesewas ?? null,
    notes: r.e.notes,
  }));
}

export const STAGES: EnquiryStage[] = ['new', 'quoted', 'deposit_paid', 'done'];

export async function setEnquiryStage(db: AnyDb, by: Who, ref: string, to: EnquiryStage, reason?: string) {
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(s.enquiries).where(eq(s.enquiries.ref, ref)).for('update');
    if (!e) throw new BookingStateError('That enquiry no longer exists.');
    await tx.update(s.enquiries).set({ stage: to }).where(eq(s.enquiries.id, e.id));
    await audit(tx, {
      actor: by,
      action: reason ? 'Moved back' : 'Enquiry stage',
      entity: 'enquiry',
      entityId: e.id,
      target: ref,
      before: { stage: ENQUIRY_STAGE[e.stage] },
      after: { stage: ENQUIRY_STAGE[to], ...(reason ? { reason } : {}) },
    });
  });
}

export async function sendQuote(db: AnyDb, by: Who, input: { ref: string; lines: { label: string; qty: number; unit: number }[] }) {
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(s.enquiries).where(eq(s.enquiries.ref, input.ref)).for('update');
    if (!e) throw new BookingStateError('That enquiry no longer exists.');
    const lines = input.lines.filter((l) => l.qty > 0);
    if (!lines.length) throw new BookingStateError('Add at least one line to the quote.');
    const total = lines.reduce((t, l) => t + l.qty * l.unit, 0);
    const quote = {
      lines: lines.map((l) => ({ label: l.label, qty: l.qty, unitPesewas: l.unit })),
      totalPesewas: total,
      sentAt: new Date().toISOString(),
    };
    await tx.update(s.enquiries).set({ stage: 'quoted', quote }).where(eq(s.enquiries.id, e.id));
    await audit(tx, {
      actor: by,
      action: 'Sent quote',
      entity: 'enquiry',
      entityId: e.id,
      target: input.ref,
      after: { total: formatGhs(total) },
    });
    return { total };
  });
}

export async function setEnquiryNote(db: AnyDb, by: Who, ref: string, note: string) {
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(s.enquiries).where(eq(s.enquiries.ref, ref)).for('update');
    if (!e) throw new BookingStateError('That enquiry no longer exists.');
    await tx.update(s.enquiries).set({ notes: note }).where(eq(s.enquiries.id, e.id));
    await audit(tx, { actor: by, action: 'Edited staff note', entity: 'enquiry', entityId: e.id, target: ref });
  });
}

export { FLOW };
