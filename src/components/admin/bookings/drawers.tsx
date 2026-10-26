'use client';
// Booking and room drawers (Admin.dc.html buildDrawer: booking, room).
import { useEffect, useState } from 'react';
import { loadBooking, loadRoom, saveBookingNote, setRoomStatusAction } from '@/app/admin/(app)/bookings/actions';
import { BOOKING_STATUS, ROOM_STATUS, SOURCE, type RoomStatus } from '@/lib/admin/labels';
import { formatDayMonth } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhoneLocal } from '@/lib/phone';
import { useAdmin } from '../context';
import { DrawerFrame, DrawerLoading } from '../drawer';
import type { Action } from '../ui';
import { useBookingActions } from './use-booking-actions';

function useLoad<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void load()
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function BookingDrawer({ spec }: { spec: { ref: string } }) {
  const { closeDrawer, version } = useAdmin();
  const actions = useBookingActions();
  const b = useLoad(() => loadBooking(spec.ref), [spec.ref, version]);
  if (b === undefined) return <DrawerLoading label={`Booking ${spec.ref}`} />;
  if (b === null) {
    closeDrawer();
    return null;
  }
  const extras = Math.max(0, b.total - b.roomCharges);
  return (
    <DrawerFrame
      kicker={`${b.ref} · ${SOURCE[b.source]}`}
      title={b.guest}
      status={BOOKING_STATUS[b.status]}
      fields={[
        { k: 'Phone', v: b.phone ? formatPhoneLocal(b.phone) : 'Not given', mono: true },
        ...(b.email ? [{ k: 'Email', v: b.email }] : []),
        { k: 'Room', v: `${b.typeName} · No. ${b.room}` },
        { k: 'Dates', v: `${formatDayMonth(b.checkIn)} → ${formatDayMonth(b.checkOut)} · ${b.nights} night${b.nights > 1 ? 's' : ''}` },
        { k: 'Guests', v: String(b.guests) },
        { k: 'Arrival', v: b.arrivalHour != null ? `Around ${String(b.arrivalHour).padStart(2, '0')}:00` : 'Not given' },
        ...(b.requests ? [{ k: 'Requests', v: b.requests }] : []),
      ]}
      sections={[
        {
          title: 'CHARGES & PAYMENTS',
          lines: [
            { k: `${b.code} × ${b.nights}`, v: formatGhs(Math.min(b.roomCharges || b.total, b.total)) },
            ...(extras > 0 && b.roomCharges ? [{ k: 'EXTRAS', v: formatGhs(extras) }] : []),
            { k: 'TOTAL', v: formatGhs(b.total) },
            { k: `PAID${b.method ? ' · ' + b.method.toUpperCase() : ''}`, v: formatGhs(b.paid), color: 'var(--green)' },
            ...(b.refunded ? [{ k: 'REFUNDED', v: '− ' + formatGhs(b.refunded), color: 'var(--red)' }] : []),
            { k: 'BALANCE', v: formatGhs(Math.max(0, b.total - b.paid)), color: b.total - b.paid > 0 ? 'var(--amber-ink)' : 'inherit' },
          ],
        },
      ]}
      note={{ value: b.notes, save: (v) => saveBookingNote(b.ref, v) }}
      actions={actions(b, true)}
    />
  );
}

export function RoomDrawer({ spec }: { spec: { number: string } }) {
  const { openDrawer, can, toast, refresh, version } = useAdmin();
  const r = useLoad(() => loadRoom(spec.number), [spec.number, version]);
  if (r === undefined) return <DrawerLoading label={`Room ${spec.number}`} />;
  if (r === null) return null;
  const status: RoomStatus = r.current ? 'occupied' : r.status === 'occupied' ? 'available' : r.status;
  const acts: Action[] = [];
  if (r.current)
    acts.push({ label: 'Open booking', icon: 'eye', kind: 'primary', on: () => openDrawer({ kind: 'booking', ref: r.current!.ref }) });
  else if (can('rooms.status'))
    (['available', 'cleaning', 'maintenance', 'out_of_order'] as const)
      .filter((st) => st !== status)
      .forEach((st) =>
        acts.push({
          label: st === 'available' ? 'Mark ready' : `Mark ${ROOM_STATUS[st].toLowerCase()}`,
          icon: st === 'available' ? 'check' : st === 'cleaning' ? 'sparkle' : st === 'maintenance' ? 'wrench' : 'ban',
          kind: st === 'available' ? 'primary' : 'ghost',
          on: async () => {
            const res = await setRoomStatusAction(r.number, st);
            toast(res.ok ? res.title : res.error, res.ok ? res.body : undefined);
            if (res.ok) refresh();
          },
        }),
      );
  return (
    <DrawerFrame
      kicker={`ROOM ${r.number}`}
      title={`${r.name} room`}
      status={ROOM_STATUS[status]}
      fields={[
        { k: 'Rate', v: `${formatGhs(r.price)} a night`, mono: true },
        { k: 'Sleeps', v: String(r.sleeps) },
        { k: 'Beds', v: r.beds },
        ...(r.current
          ? [
              { k: 'Guest', v: r.current.guest },
              { k: 'Leaves', v: formatDayMonth(r.current.checkOut) },
            ]
          : []),
      ]}
      sections={[
        {
          title: 'COMING UP',
          empty: 'No bookings coming up for this room.',
          lines: r.upcoming.map((x) => ({ k: `${formatDayMonth(x.checkIn)} · ${x.guest}`, v: `${x.nights}n` })),
        },
      ]}
      actions={acts}
    />
  );
}
