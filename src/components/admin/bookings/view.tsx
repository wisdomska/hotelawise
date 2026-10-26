'use client';
// Room bookings (Admin.dc.html screen "bookings"): the list with status
// filters and the two-week Rooms-by-day calendar with drag to move or extend.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { moveBookingAction } from '@/app/admin/(app)/bookings/actions';
import { BOOKING_FILTERS, BOOKING_STATUS, type BookingStatus } from '@/lib/admin/labels';
import { addDays, type IsoDate } from '@/lib/dates';
import type { BookingRow } from '@/server/admin/bookings';
import { useAdmin } from '../context';
import { PageHeader, Tabs, useTab } from '../page-parts';
import { Timeline, type TlBar } from '../timeline';
import type { Action, Tone } from '../ui';
import { QuickBooking } from './modals';
import { BookingTable } from './table';

type Props = {
  today: IsoDate;
  status: BookingStatus | null;
  page: number;
  list: { rows: BookingRow[]; total: number; counts: Partial<Record<BookingStatus, number>> } | null;
  timeline: BookingRow[] | null;
  from: IsoDate;
  rooms: { number: string; name: string }[] | null;
  canExport: boolean;
};

const TONE: Partial<Record<BookingStatus, Tone | 'green'>> = {
  confirmed: 'solid',
  checked_in: 'green',
  pending_payment: 'amber',
  checked_out: 'grey',
  no_show: 'red',
};

export function BookingsView(p: Props) {
  const { can, openModal, openDrawer, toast, refresh } = useAdmin();
  const [tab, setTab] = useTab(['List', 'Calendar'], 'List');
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch))
      if (v === null) q.delete(k);
      else q.set(k, v);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  const actions: Action[] = [];
  if (can('bookings.create'))
    actions.push({
      label: 'New booking',
      icon: 'plus',
      kind: 'primary',
      hint: 'Phone, WhatsApp or walk-in',
      on: () => openModal(<QuickBooking />),
    });
  if (p.canExport)
    actions.push({ label: 'Export', icon: 'download', hint: 'Download all bookings as CSV', on: () => download('/admin/bookings/export') });

  const all = p.list ? Object.values(p.list.counts).reduce((t, n) => t + (n ?? 0), 0) : 0;
  const chips = [
    { label: `All${all ? ` · ${all}` : ''}`, pressed: !p.status, href: href({ s: null, p_b: null }) },
    ...BOOKING_FILTERS.map((st) => {
      const n = p.list?.counts[st] ?? 0;
      return { label: `${BOOKING_STATUS[st]}${n ? ` · ${n}` : ''}`, pressed: p.status === st, href: href({ s: st, p_b: null }) };
    }),
  ];

  const drop = (b: BookingRow) => async (mode: 'move' | 'extend', delta: number) => {
    const r = await moveBookingAction({ ref: b.ref, mode, delta });
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    refresh();
  };
  const movable = (b: BookingRow) => can('bookings.edit') && ['confirmed', 'pending_payment', 'checked_in'].includes(b.status);

  return (
    <>
      <PageHeader title="Room bookings" sub="Every booking from the website, the phone and the front door." actions={actions} />
      <Tabs list={['List', 'Calendar']} cur={tab} set={setTab} label="Bookings view" />
      {tab === 'List' && p.list && (
        <BookingTable
          title="Bookings"
          rows={p.list.rows}
          count={String(p.list.total)}
          chips={chips}
          pager={{ page: p.page, total: p.list.total, href: (n) => href({ p_b: n ? String(n) : null }) }}
          empty={{
            icon: 'bed',
            text: p.status ? `No ${BOOKING_STATUS[p.status].toLowerCase()} bookings` : 'No bookings yet',
            sub: p.status ? 'Try another filter.' : undefined,
          }}
        />
      )}
      {tab === 'Calendar' && p.timeline && p.rooms && (
        <Timeline
          title="Rooms by day"
          hint="Drag a booking to move it. Drag its right edge to change the nights."
          rowHead="ROOM"
          firstCol={96}
          start={p.from}
          today={p.today}
          onShift={(d) => router.replace(href({ from: d === 'today' ? null : addDays(p.from, d) }), { scroll: false })}
          rows={p.rooms.map((r) => ({
            key: r.number,
            label: r.number,
            sub: r.name,
            bars: p
              .timeline!.filter((b) => b.room === r.number)
              .map<TlBar>((b) => ({
                key: b.ref,
                label: `${b.guest.split(' ')[0]} · ${b.ref}`,
                title: `${b.ref} · ${b.guest} · ${BOOKING_STATUS[b.status]}.${movable(b) ? ' Drag to move, drag the right edge to change nights.' : ''}`,
                from: b.checkIn,
                to: b.checkOut,
                tone: TONE[b.status] ?? 'mid',
                onOpen: () => openDrawer({ kind: 'booking', ref: b.ref }),
                onDrop: movable(b) ? drop(b) : undefined,
              })),
          }))}
        />
      )}
      {tab !== 'List' && !p.timeline && <Loading />}
      {tab === 'List' && !p.list && <Loading />}
    </>
  );
}

function download(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.click();
}

function Loading() {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--mute)' }}>Loading…</div>;
}
