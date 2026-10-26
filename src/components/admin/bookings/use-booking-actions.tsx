'use client';
// The buttons a booking offers, in the prototype's order and rules
// (Admin.dc.html bookingActions): check in on the day, check out once paid,
// take or record payment, and in the drawer the rest.
import {
  addRoomServiceAction,
  cancelBookingAction,
  checkInAction,
  checkOutAction,
  deleteBookingAction,
  undoCheckInAction,
} from '@/app/admin/(app)/bookings/actions';
import type { BookingStatus } from '@/lib/admin/labels';
import { todayInAccra } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { telHref } from '@/lib/phone';
import { useAdmin } from '../context';
import { ConfirmModal } from '../modal';
import type { Action } from '../ui';
import { BackModal, PaymentModal, RefundModal } from './modals';

export type BookingLike = {
  ref: string;
  guest: string;
  phone: string;
  room: string;
  checkIn: string;
  status: BookingStatus;
  total: number;
  paid: number;
  refunded?: number;
  refundable?: number;
};

export function useBookingActions() {
  const { can, openModal, openDrawer, toast, refresh, me } = useAdmin();
  const quick = (fn: () => Promise<{ ok: boolean; title?: string; body?: string; error?: string }>) => async () => {
    const r = await fn();
    if (r.ok) {
      toast(r.title ?? 'Done.', r.body);
      refresh();
    } else toast(r.error ?? 'That didn’t work.');
  };
  return (b: BookingLike, inDrawer: boolean): Action[] => {
    const a: Action[] = [];
    const today = todayInAccra();
    const due = b.total - b.paid;
    if (['confirmed', 'pending_payment'].includes(b.status) && b.checkIn <= today && can('bookings.checkin'))
      a.push({ label: 'Check in', icon: 'key', kind: 'primary', on: quick(() => checkInAction(b.ref)) });
    if (b.status === 'checked_in' && due <= 0 && can('bookings.checkout'))
      a.push({ label: 'Check out', icon: 'logout', kind: 'primary', on: quick(() => checkOutAction(b.ref)) });
    if (due > 0 && !['cancelled', 'no_show'].includes(b.status) && can('bookings.payment.desk'))
      a.push(
        b.status === 'checked_in'
          ? {
              label: 'Take payment',
              icon: 'cash',
              kind: 'primary',
              hint: `${formatGhs(due)} due before check-out`,
              on: () => openModal(<PaymentModal b={b} />),
            }
          : { label: 'Record payment', icon: 'cash', iconOnly: !inDrawer, on: () => openModal(<PaymentModal b={b} />) },
      );
    if (!inDrawer) a.push({ label: 'Open details', icon: 'eye', iconOnly: true, on: () => openDrawer({ kind: 'booking', ref: b.ref }) });
    if (inDrawer) {
      if (['checked_in', 'confirmed'].includes(b.status) && can('bookings.edit'))
        a.push({ label: 'Add room service', icon: 'bell', on: quick(() => addRoomServiceAction(b.ref)) });
      if (b.status === 'checked_in' && can('bookings.checkin'))
        a.push({
          label: 'Undo check-in',
          icon: 'arrowleft',
          on: () =>
            openModal(<BackModal refLabel={b.ref} from="Checked-in" to="Confirmed" onSubmit={(why) => undoCheckInAction(b.ref, why)} />),
        });
      if (b.phone) a.push({ label: 'Call guest', icon: 'phone', on: () => (location.href = telHref(b.phone)) });
      if (!['cancelled', 'checked_out', 'no_show'].includes(b.status) && can('bookings.edit'))
        a.push({
          label: 'Cancel booking',
          icon: 'ban',
          kind: 'danger',
          on: () =>
            openModal(
              <ConfirmModal
                title={`Cancel ${b.ref}?`}
                sub="The room goes back on sale and the guest gets an SMS. Refund separately if they paid."
                confirm="Cancel booking"
                run={() => cancelBookingAction(b.ref)}
              />,
            ),
        });
      if (me.isSuper && (b.refundable ?? 0) > 0)
        a.push({
          label: 'Refund',
          icon: 'undo',
          on: () => openModal(<RefundModal b={{ ref: b.ref, paid: b.paid, refunded: b.refunded ?? 0, refundable: b.refundable ?? 0 }} />),
        });
      if (can('bookings.delete'))
        a.push({
          label: 'Delete',
          icon: 'trash',
          kind: 'danger',
          on: () =>
            openModal(
              <ConfirmModal
                title={`Delete ${b.ref}?`}
                sub="This removes it from reports. Only use this for test or duplicate bookings with no payments."
                confirm="Delete forever"
                run={() => deleteBookingAction(b.ref)}
              />,
            ),
        });
    }
    return a;
  };
}
