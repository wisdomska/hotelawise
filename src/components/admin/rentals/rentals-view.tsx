'use client';
// Rental orders screen from Admin.dc.html: List with status chips, Calendar
// (pickup to return) and Board by status.
import { useRouter, useSearchParams } from 'next/navigation';
import { RENTAL_STATUS, type RentalStatus } from '@/lib/admin/labels';
import { addDays, formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { OrderRow } from '@/server/admin/rentals';
import { useAdmin } from '../context';
import { Kanban } from '../kanban';
import { PageHeader, Tabs, useTab } from '../page-parts';
import { c, col, DataTable, type Cell } from '../table';
import { Timeline } from '../timeline';
import { statusTone } from '../ui';
import { useOrderActions, type OrderLike } from './ui';

const TABS = ['List', 'Calendar', 'Board'] as const;
const FILTERS: RentalStatus[] = ['pending_payment', 'reserved', 'ready_for_pickup', 'collected', 'returned', 'completed', 'cancelled'];
const LANES: RentalStatus[] = ['pending_payment', 'reserved', 'ready_for_pickup', 'collected', 'returned'];

type Props = {
  tab: (typeof TABS)[number];
  today: IsoDate;
  list?: { rows: OrderRow[]; total: number; counts: Partial<Record<RentalStatus, number>>; status: RentalStatus | null; page: number };
  cal?: { from: IsoDate; rows: OrderRow[] };
  board?: OrderRow[];
};

const like = (o: OrderRow): OrderLike => ({ ...o, refundPending: o.status === 'returned' });
const paidUp = (o: OrderRow) => o.paid >= o.total;

/** Timeline paging lives in ?from= so a refresh keeps the same fortnight. */
export function useShiftFrom(start: IsoDate, today: IsoDate) {
  const sp = useSearchParams();
  const router = useRouter();
  return (n: number | 'today') => {
    const q = new URLSearchParams(sp.toString());
    const next = n === 'today' ? addDays(today, -2) : addDays(start, n);
    if (n === 'today') q.delete('from');
    else q.set('from', next);
    router.replace(`?${q.toString()}`, { scroll: false });
  };
}

export function RentalsView(p: Props) {
  const [tab, setTab] = useTab(TABS, 'List');
  const { openDrawer } = useAdmin();
  const actions = useOrderActions();
  const open = (ref: string) => () => openDrawer({ kind: 'rental', ref });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Rental orders"
        sub="Canopies, tables and chairs. Customers collect from Wisepak Lane."
        actions={[
          {
            label: 'New order',
            icon: 'plus',
            kind: 'primary',
            hint: 'Opens the rentals checkout in a new tab',
            on: () => window.open('/rent', '_blank', 'noopener'),
          },
        ]}
      />
      <Tabs list={TABS} cur={tab} set={setTab} label="Rental views" />
      {p.tab === 'List' && p.list && <OrderList list={p.list} actions={actions} open={open} />}
      {p.tab === 'Calendar' && p.cal && <OrderCalendar cal={p.cal} today={p.today} open={open} />}
      {p.tab === 'Board' && p.board && (
        <Kanban
          lanes={LANES.map((st) => ({
            title: RENTAL_STATUS[st],
            cards: p
              .board!.filter((o) => o.status === st)
              .map((o) => ({
                key: o.ref,
                ref: o.ref,
                when: formatDayMonth(o.starts),
                title: o.who,
                sub: `${o.occasion || 'Rental'} · ${paidUp(o) ? 'paid' : o.payMode === 'at_pickup' ? 'pay at pickup' : 'awaiting payment'}`,
                onOpen: open(o.ref),
                actions: actions(like(o), false).filter((a) => a.label !== 'Open details'),
              })),
          }))}
        />
      )}
    </div>
  );
}

function OrderList({
  list,
  actions,
  open,
}: {
  list: NonNullable<Props['list']>;
  actions: ReturnType<typeof useOrderActions>;
  open: (ref: string) => () => void;
}) {
  const href = (status: RentalStatus | null, page = 0) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (page) q.set('p_orders', String(page));
    const s = q.toString();
    return s ? `?${s}` : '?';
  };
  const label = list.status ? RENTAL_STATUS[list.status] : 'All';
  return (
    <DataTable
      title="Orders"
      count={String(list.total)}
      minW={920}
      chips={[
        { label: 'All', pressed: !list.status, href: href(null) },
        ...FILTERS.map((st) => ({ label: `${RENTAL_STATUS[st]} · ${list.counts[st] ?? 0}`, pressed: list.status === st, href: href(st) })),
      ]}
      cols={[col('REF'), col('CUSTOMER'), col('DATES'), col('ITEMS'), col('PAYMENT'), col('STATUS'), col('TOTAL', 'right')]}
      rows={list.rows.map((o) => {
        const pay: Cell = paidUp(o)
          ? c('Paid', 'chip', undefined, 'green')
          : c(o.payMode === 'at_pickup' ? 'Pay at pickup' : 'Awaiting payment', 'chip', undefined, 'amber');
        return {
          key: o.ref,
          on: open(o.ref),
          cells: [
            c(o.ref, 'mono'),
            c(o.who, undefined, o.occasion),
            c(`${formatDayMonth(o.starts)}${o.ends !== o.starts ? ' → ' + formatDayMonth(o.ends) : ''}`, 'mono'),
            c(o.items.map((i) => `${i.qty} × ${i.name.toLowerCase()}`).join(', '), 'wrap'),
            pay,
            c(RENTAL_STATUS[o.status], 'chip'),
            c(formatGhs(o.total), 'money', `paid ${formatGhs(o.paid)}`),
          ],
          actions: actions(like(o), false),
        };
      })}
      empty={{ icon: 'pkg', text: list.status ? `No ${label.toLowerCase()} orders` : 'No orders yet' }}
      pager={{ page: list.page, total: list.total, href: (n) => href(list.status, n) }}
    />
  );
}

function OrderCalendar({ cal, today, open }: { cal: NonNullable<Props['cal']>; today: IsoDate; open: (ref: string) => () => void }) {
  const shift = useShiftFrom(cal.from, today);
  return (
    <Timeline
      title="Reservations by date"
      hint="From pickup to return. Click a bar for details."
      rowHead="ORDER"
      firstCol={150}
      start={cal.from}
      today={today}
      onShift={shift}
      emptyText="Nothing in these two weeks. Use the arrows to look further."
      rows={cal.rows.map((o) => ({
        key: o.ref,
        label: o.ref,
        sub: o.who,
        bars: [
          {
            key: o.ref,
            label: `${o.who.split(' ')[0]}${o.occasion ? ' · ' + o.occasion : ''}`,
            title: `${o.ref} · ${o.who} · ${RENTAL_STATUS[o.status]}`,
            from: o.starts,
            // Pickup day through the return day (the day after the event), exclusive end.
            to: addDays(o.ends, 2),
            tone: statusTone(RENTAL_STATUS[o.status]),
            onOpen: open(o.ref),
          },
        ],
      }))}
    />
  );
}
