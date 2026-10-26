'use client';
// The dashboard (Admin.dc.html screen "dashboard"): today's numbers, revenue
// and occupancy charts, who is arriving and leaving, rental pickups and
// returns, and the next events.
import { ENQUIRY_STAGE, RENTAL_STATUS } from '@/lib/admin/labels';
import { addDays, formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { BookingRow } from '@/server/admin/bookings';
import type { Series } from '@/server/admin/dashboard';
import type { EnquiryRow, OrderRow } from '@/server/admin/rentals';
import { BookingTable } from '../bookings/table';
import { QuickBooking } from '../bookings/modals';
import { BarChart, ChartGrid, LineChart, RankChart, Spark, SplitChart } from '../charts';
import { useAdmin } from '../context';
import { KpiGrid, PageHeader, type Kpi } from '../page-parts';
import { useOrderActions } from '../rentals/ui';
import { c, col, DataTable } from '../table';
import type { Action } from '../ui';

type Props = {
  first: string;
  hour: number;
  today: IsoDate;
  money: boolean;
  series: Series;
  tonight: [string, number, number][];
  desk: BookingRow[];
  rentals: OrderRow[];
  owed: { count: number; owed: number };
  events: EnquiryRow[];
};

const sum = (x: number[]) => x.reduce((p, q) => p + q, 0);
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);
const ghsK = (n: number) => (n >= 1_000_000 ? `GHS ${(n / 100_000).toFixed(1)}k` : formatGhs(n));
const day = (d: IsoDate, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });

export function DashboardView(p: Props) {
  const { can, openModal, openDrawer } = useAdmin();
  const orderActions = useOrderActions();
  const s = p.series;
  const rev = s.days.map((_, i) => (s.rooms[i] ?? 0) + (s.rentals[i] ?? 0));
  const today = rev[29] ?? 0;
  const d1 = pct(today, rev[28] ?? 0);
  const week = sum(rev.slice(23));
  const chg = pct(week, sum(rev.slice(16, 23)));
  const avgOcc = Math.round(sum(s.occupancy) / Math.max(1, s.occupancy.length));
  const inHouse = p.tonight.reduce((t, r) => t + r[1], 0);
  const rooms = p.tonight.reduce((t, r) => t + r[2], 0) || 16;
  const occ = Math.round((inHouse / rooms) * 100);
  const arrivals = p.desk.filter((b) => b.checkIn === p.today);
  const departures = p.desk.filter((b) => b.checkOut === p.today);
  const unpaidArr = arrivals.filter((b) => b.status === 'pending_payment').length;
  const pickups = p.rentals.filter((r) => r.starts === p.today);
  const returns = p.rentals.filter((r) => addDays(r.ends, 1) === p.today && !pickups.includes(r));

  const kpis: Kpi[] = [
    ...(p.money
      ? [
          {
            label: 'Revenue today',
            value: formatGhs(today),
            sub: `${d1 >= 0 ? '+' : ''}${d1}% on yesterday`,
            subColor: d1 >= 0 ? 'var(--green)' : 'var(--red)',
            trend: d1 >= 0 ? ('trendup' as const) : ('trenddown' as const),
            spark: <Spark values={rev.slice(16)} />,
          },
          {
            label: 'Last 7 days',
            value: formatGhs(week),
            sub: `${chg >= 0 ? '+' : ''}${chg}% on the week before`,
            subColor: chg >= 0 ? 'var(--green)' : 'var(--red)',
            trend: chg >= 0 ? ('trendup' as const) : ('trenddown' as const),
            spark: <Spark values={rev.slice(9, 16).concat(rev.slice(23))} />,
          },
        ]
      : []),
    { label: 'Occupancy tonight', value: `${occ}%`, sub: `${inHouse} of ${rooms} rooms · avg ${avgOcc}%`, meter: occ },
    {
      label: 'Arriving · leaving',
      value: `${arrivals.length} · ${departures.length}`,
      sub: unpaidArr ? `${unpaidArr} arrival${unpaidArr > 1 ? 's' : ''} still to pay` : 'Today',
      subColor: unpaidArr ? 'var(--amber-ink)' : undefined,
    },
    { label: 'Rentals out today', value: `${pickups.length} · ${returns.length}`, sub: 'pickups · returns' },
    {
      label: 'Awaiting payment',
      value: String(p.owed.count),
      sub: p.money ? `${formatGhs(p.owed.owed)} outstanding` : 'bookings and orders',
      subColor: p.owed.count ? 'var(--amber-ink)' : 'var(--green)',
    },
  ];

  const labels = s.days.map((d) => day(d, { weekday: 'short', day: 'numeric', month: 'short' }));
  const short = s.days.map((d) => formatDayMonth(d));
  const actions: Action[] = can('bookings.create')
    ? [{ label: 'New booking', icon: 'plus', kind: 'primary', hint: 'Phone, WhatsApp or walk-in', on: () => openModal(<QuickBooking />) }]
    : [];

  return (
    <>
      <PageHeader
        title={`Good ${p.hour < 12 ? 'morning' : p.hour < 18 ? 'afternoon' : 'evening'}, ${p.first}`}
        sub={`${day(p.today, { weekday: 'long', day: 'numeric', month: 'long' })} · here's how the hotel is doing.`}
        actions={actions}
      />
      <KpiGrid kpis={kpis} />
      <ChartGrid>
        {p.money && (
          <BarChart
            title="Revenue, last 14 days"
            big={formatGhs(sum(rev.slice(16)))}
            bigNote={`rooms ${formatGhs(sum(s.rooms.slice(16)))} · rentals ${formatGhs(sum(s.rentals.slice(16)))}`}
            labels={labels.slice(16)}
            short={s.days.slice(16).map((d) => day(d, { day: 'numeric' }))}
            a={s.rooms.slice(16)}
            b={s.rentals.slice(16)}
            nameA="Rooms"
            nameB="Rentals"
            colorA="var(--chart)"
            colorB="#F2B544"
            fmt={ghsK}
            span="var(--sp2)"
          />
        )}
        {p.money && (
          <SplitChart
            title="Where the money came from"
            parts={[
              ['Rooms', sum(s.rooms), 'var(--chart)'],
              ['Rentals', sum(s.rentals), '#F2B544'],
            ]}
            fmt={formatGhs}
            note="Last 30 days"
          />
        )}
        <LineChart
          title="Occupancy, last 30 days"
          big={`${avgOcc}%`}
          bigNote="average · dashed line"
          labels={labels}
          short={short}
          pct
          series={[{ name: 'Occupancy', values: s.occupancy, color: 'var(--chart)', fill: true }]}
          fmt={(v) => `${Math.round(v)}%`}
          refLine={avgOcc}
          refLabel={`avg ${avgOcc}%`}
          span="var(--sp2)"
        />
        <RankChart
          title="Tonight by room type"
          note="share of rooms booked"
          rows={p.tonight.map(([name, booked, total]) => [`${name} · ${booked}/${total}`, total ? Math.round((booked / total) * 100) : 0])}
          fmt={(v) => `${v}%`}
          asShare
        />
      </ChartGrid>
      <BookingTable
        title="Arriving and leaving today"
        rows={[...arrivals, ...departures]}
        empty={{ icon: 'door', text: 'No arrivals or check-outs today' }}
      />
      {can('rentals.view') && (
        <DataTable
          title="Rental pickups and returns today"
          count={String(pickups.length + returns.length)}
          minW={920}
          empty={{ icon: 'pkg', text: 'No pickups or returns today' }}
          cols={[col('REF'), col('CUSTOMER'), col('DATES'), col('ITEMS'), col('PAYMENT'), col('STATUS'), col('TOTAL', 'right')]}
          rows={[...pickups, ...returns].map((r) => ({
            key: r.ref,
            on: () => openDrawer({ kind: 'rental', ref: r.ref }),
            cells: [
              c(r.ref, 'mono'),
              c(r.who, undefined, r.occasion || undefined),
              c(`${formatDayMonth(r.starts)}${r.ends !== r.starts ? ` → ${formatDayMonth(r.ends)}` : ''}`, 'mono'),
              c(r.items.map((i) => `${i.qty} × ${i.name.toLowerCase()}`).join(', '), 'wrap'),
              r.paid >= r.total ? c('Paid', 'chip', undefined, 'green') : c('Pay at pickup', 'chip', undefined, 'amber'),
              c(RENTAL_STATUS[r.status], 'chip'),
              c(formatGhs(r.total), 'money', `paid ${formatGhs(r.paid)}`),
            ],
            actions: orderActions(r, false),
          }))}
        />
      )}
      {can('venues.view') && (
        <DataTable
          title="Next events"
          count={String(p.events.length)}
          minW={640}
          empty={{ icon: 'calendar', text: 'No events coming up' }}
          cols={[col('DATE'), col('WHO'), col('VENUE'), col('GUESTS', 'right'), col('STAGE')]}
          rows={p.events.map((e) => ({
            key: e.ref,
            on: () => openDrawer({ kind: 'enquiry', ref: e.ref }),
            cells: [
              c(formatDayMonth(e.date), 'mono'),
              c(e.who, undefined, e.what || undefined),
              c(e.venue),
              c(e.guests, 'num'),
              c(ENQUIRY_STAGE[e.stage], 'chip'),
            ],
          }))}
        />
      )}
    </>
  );
}
