// Payments & refunds: every successful payment (Paystack and the desk), the
// refunds queue, rental deposits held, and the day's cash-up by method. Days
// are Accra days (UTC).
import 'server-only';
import { sql } from 'drizzle-orm';
import { addDays, type IsoDate } from '@/lib/dates';
import { METHOD, REFUND_STATUS, type Method } from '@/lib/admin/labels';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from '@/server/services/holds';

export const TX_PAGE = 8;

export const TX_FILTERS = ['all', 'rooms', 'rentals', 'venues', 'paystack', 'desk'] as const;
export type TxFilter = (typeof TX_FILTERS)[number];

export type TxRow = {
  id: string;
  day: IsoDate;
  ref: string;
  kind: 'booking' | 'rental' | 'enquiry';
  who: string;
  method: string;
  channel: 'Paystack' | 'Desk';
  amount: number;
};

/** The payment's booking, order or enquiry, and who it was for. */
const TARGET = sql`
  left join bookings b on b.id = p.booking_id
  left join customers cb on cb.id = b.customer_id
  left join rental_orders o on o.id = p.order_id
  left join enquiries e on e.id = p.enquiry_id
  left join customers ce on ce.id = e.customer_id`;

const FILTER: Record<TxFilter, ReturnType<typeof sql>> = {
  all: sql`true`,
  rooms: sql`p.booking_id is not null`,
  rentals: sql`p.order_id is not null`,
  venues: sql`p.enquiry_id is not null`,
  paystack: sql`p.channel = 'paystack'`,
  desk: sql`p.channel = 'desk'`,
};

export const methodLabel = (m: string | null, channel: string) =>
  m ? (METHOD[m as Method] ?? m) : channel === 'paystack' ? 'Paystack (online)' : 'Desk';

type RawTx = {
  id: string;
  day: string;
  ref: string | null;
  kind: TxRow['kind'];
  who: string | null;
  method: string | null;
  channel: string;
  amount: number;
};

const toTx = (r: RawTx): TxRow => ({
  id: r.id,
  day: r.day,
  ref: r.ref ?? '—',
  kind: r.kind,
  who: r.who ?? '—',
  method: methodLabel(r.method, r.channel),
  channel: r.channel === 'desk' ? 'Desk' : 'Paystack',
  amount: Number(r.amount),
});

const TX_SELECT = sql`
  select p.id, (coalesce(p.paid_at, p.created_at) at time zone 'UTC')::date::text as day,
         coalesce(b.ref, o.ref, e.ref) as ref,
         case when p.booking_id is not null then 'booking' when p.order_id is not null then 'rental' else 'enquiry' end as kind,
         coalesce(cb.name, o.collector_name, ce.name) as who,
         p.method::text as method, p.channel, p.amount_pesewas as amount
    from payments p ${TARGET}`;

export async function listTransactions(db: AnyDb, opts: { filter: TxFilter; page: number }) {
  const where = sql`p.status = 'success' and ${FILTER[opts.filter]}`;
  const [rows, [n]] = await Promise.all([
    db.execute(sql`${TX_SELECT} where ${where}
      order by coalesce(p.paid_at, p.created_at) desc limit ${TX_PAGE} offset ${Math.max(0, opts.page) * TX_PAGE}`),
    db.execute(sql`select count(*)::int as n from payments p where ${where}`).then((r) => rowsOf<{ n: number }>(r)),
  ]);
  return { rows: rowsOf<RawTx>(rows).map(toTx), total: Number(n?.n ?? 0) };
}

/** Everything for the CSV export, newest first. */
export async function allTransactions(db: AnyDb, filter: TxFilter, limit = 10_000) {
  const r = await db.execute(sql`${TX_SELECT} where p.status = 'success' and ${FILTER[filter]}
    order by coalesce(p.paid_at, p.created_at) desc limit ${limit}`);
  return rowsOf<RawTx>(r).map(toTx);
}

export type RefundRow = {
  id: string;
  ref: string;
  who: string;
  reason: string;
  by: string;
  approvedBy: string | null;
  amount: number;
  status: string;
  pending: boolean;
  channel: 'Paystack' | 'Desk';
  at: string;
};

export async function listRefunds(db: AnyDb, page: number) {
  const [rows, [n]] = await Promise.all([
    db.execute(sql`
      select r.id, coalesce(b.ref, o.ref, e.ref) as ref, coalesce(cb.name, o.collector_name, ce.name) as who,
             r.reason, coalesce(ur.name, 'System') as by, ua.name as approved_by, r.amount_pesewas as amount,
             r.status, p.channel, (r.created_at at time zone 'UTC')::date::text as at
        from refunds r
        join payments p on p.id = r.payment_id ${TARGET}
        left join "user" ur on ur.id = r.requested_by
        left join "user" ua on ua.id = r.approved_by
       order by (r.status = 'pending_approval') desc, r.created_at desc
       limit ${TX_PAGE} offset ${Math.max(0, page) * TX_PAGE}`),
    db.execute(sql`select count(*)::int as n from refunds`).then((r) => rowsOf<{ n: number }>(r)),
  ]);
  type Raw = {
    id: string;
    ref: string | null;
    who: string | null;
    reason: string;
    by: string;
    approved_by: string | null;
    amount: number;
    status: keyof typeof REFUND_STATUS;
    channel: string;
    at: string;
  };
  return {
    rows: rowsOf<Raw>(rows).map((r): RefundRow => ({
      id: r.id,
      ref: r.ref ?? '—',
      who: r.who ?? '—',
      reason: r.reason,
      by: r.by,
      approvedBy: r.approved_by,
      amount: Number(r.amount),
      status: REFUND_STATUS[r.status] ?? r.status,
      pending: r.status === 'pending_approval',
      channel: r.channel === 'desk' ? 'Desk' : 'Paystack',
      at: r.at,
    })),
    total: Number(n?.n ?? 0),
  };
}

export type DepositRow = { ref: string; who: string; dueBack: IsoDate; held: number; status: string };

/** Security deposits on orders that are paid and not yet back. */
export async function depositsHeld(db: AnyDb): Promise<DepositRow[]> {
  const r = await db.execute(sql`
    select o.ref, o.collector_name as who, o.ends::text as ends, least(o.deposit_pesewas, o.paid_pesewas) as held, o.status
      from rental_orders o
     where o.status in ('reserved', 'ready_for_pickup', 'collected') and o.paid_pesewas > 0 and o.deposit_pesewas > 0
     order by o.ends, o.ref`);
  return rowsOf<{ ref: string; who: string; ends: string; held: number; status: string }>(r).map((x) => ({
    ref: x.ref,
    who: x.who,
    dueBack: addDays(x.ends, 1),
    held: Number(x.held),
    status: x.status,
  }));
}

export type CashUpRow = { method: string; channel: 'Paystack' | 'Desk'; n: number; amount: number };

export async function cashUp(db: AnyDb, day: IsoDate): Promise<CashUpRow[]> {
  const r = await db.execute(sql`
    select p.method::text as method, p.channel, count(*)::int as n, sum(p.amount_pesewas)::int as amount
      from payments p
     where p.status = 'success'
       and coalesce(p.paid_at, p.created_at) >= ${day}::date
       and coalesce(p.paid_at, p.created_at) < ${addDays(day, 1)}::date
     group by 1, 2
     order by 2, 4 desc`);
  return rowsOf<{ method: string | null; channel: string; n: number; amount: number }>(r).map((x) => ({
    method: methodLabel(x.method, x.channel),
    channel: x.channel === 'desk' ? 'Desk' : 'Paystack',
    n: Number(x.n),
    amount: Number(x.amount),
  }));
}

export async function paymentKpis(db: AnyDb, today: IsoDate) {
  const [today_, deps, pend] = await Promise.all([
    cashUp(db, today),
    db.execute(sql`
      select count(*)::int as n, coalesce(sum(least(deposit_pesewas, paid_pesewas)), 0)::int as held
        from rental_orders
       where status in ('reserved', 'ready_for_pickup', 'collected') and paid_pesewas > 0 and deposit_pesewas > 0`),
    db.execute(
      sql`select count(*)::int as n, coalesce(sum(amount_pesewas), 0)::int as owed from refunds where status = 'pending_approval'`,
    ),
  ]);
  const [d] = rowsOf<{ n: number; held: number }>(deps);
  const [p] = rowsOf<{ n: number; owed: number }>(pend);
  return {
    desk: today_.filter((x) => x.channel === 'Desk').reduce((t, x) => t + x.amount, 0),
    online: today_.filter((x) => x.channel === 'Paystack').reduce((t, x) => t + x.amount, 0),
    deposits: { n: Number(d?.n ?? 0), held: Number(d?.held ?? 0) },
    refunds: { n: Number(p?.n ?? 0), owed: Number(p?.owed ?? 0) },
  };
}
