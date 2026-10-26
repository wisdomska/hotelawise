// What the guest sees on "Manage my booking", worded as in Checkout.dc.html.
import { addDays, formatShortDate, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { cancelTerms, type GuestBooking } from './bookings';

export type ManageLine = { k: string; v: string; color: string; weight: number };
export type ManageView = {
  ref: string;
  status: string;
  statusBg: string;
  statusFg: string;
  title: string;
  typeName: string;
  range: string;
  guestsLabel: string;
  guest: string;
  lines: ManageLine[];
  cancelled: boolean;
  cancelNote: string;
  locked: boolean;
  lockNote: string;
  active: boolean;
  policyNote: string;
  cancelBody: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
};

const STATUS: Record<string, string> = {
  confirmed: 'Confirmed',
  pending_payment: 'Pending payment',
  held: 'Pending payment',
  checked_in: 'Checked-in',
  checked_out: 'Checked-out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  expired: 'Cancelled',
};
const METHOD: Record<string, string> = {
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  airteltigo: 'AirtelTigo Money',
  card: 'card',
  cash: 'cash',
  pos: 'card',
};

export function manageView(
  b: GuestBooking,
  opts: { now: Date; freeHours: number; depositPercent: number; checkInTime: string; deskPhone: string },
): ManageView {
  const status = STATUS[b.status] ?? b.status;
  const tone = ['Cancelled', 'No-show'].includes(status)
    ? ['#FBE9E7', '#B42318']
    : status === 'Pending payment'
      ? ['#FCEFD2', '#7A4E00']
      : ['#F6E2B3', '#000063'];
  const terms = cancelTerms(b, {
    now: opts.now,
    freeHours: opts.freeHours,
    depositPercent: opts.depositPercent,
    checkInTime: opts.checkInTime,
  });
  const method = b.lastMethod ? METHOD[b.lastMethod] : null;
  const payWay = method ?? 'the way you paid';
  const base = b.lines[0]?.amount ?? 0;
  const extras = b.total + b.discount - base;
  const n = b.nights;
  const lines: ManageLine[] = [
    { k: `${b.variantCode.replace('_PLUS', '+')} × ${n} night${n === 1 ? '' : 's'}`, v: formatGhs(base), color: 'inherit', weight: 400 },
    ...(extras > 0 ? [{ k: 'EXTRAS', v: formatGhs(extras), color: 'inherit', weight: 400 }] : []),
    ...(b.discount ? [{ k: `PROMO ${b.promoCode ?? ''}`.trim(), v: `− ${formatGhs(b.discount)}`, color: '#1F7A4D', weight: 400 }] : []),
    { k: 'TOTAL', v: formatGhs(b.total), color: 'inherit', weight: 500 },
    { k: method ? `PAID · ${method.toUpperCase()}` : 'PAID', v: formatGhs(b.paid), color: '#1F7A4D', weight: 400 },
    { k: 'BALANCE AT THE DESK', v: formatGhs(Math.max(0, b.total - b.paid)), color: 'inherit', weight: 400 },
  ];
  const freeDay = addDays(b.checkIn, -Math.ceil(opts.freeHours / 24));
  const [hh] = opts.checkInTime.split(':');
  const hourLabel = `${Number(hh) % 12 || 12}${Number(hh) < 12 ? 'am' : 'pm'}`;
  return {
    ref: b.ref ?? '',
    status,
    statusBg: tone[0]!,
    statusFg: tone[1]!,
    title: `${b.typeName} room`,
    typeName: b.variantName,
    range: `${formatShortDate(b.checkIn)} → ${formatShortDate(b.checkOut)}`,
    guestsLabel: `${b.guests} guest${b.guests === 1 ? '' : 's'}`,
    guest: b.guestName,
    lines,
    cancelled: b.status === 'cancelled' || b.status === 'expired',
    cancelNote: b.refundPending
      ? `Cancelled. ${formatGhs(b.refundPending)} is on its way back to ${payWay}, usually within 1–3 working days. We'll text you when it lands.`
      : 'This booking is cancelled. We hope to see you another time.',
    locked: ['checked_in', 'checked_out', 'no_show'].includes(b.status),
    lockNote:
      b.status === 'checked_in'
        ? `You're checked in, so changes go through the front desk. Call ${opts.deskPhone} or ask at reception.`
        : `This stay has ended, so it can't be changed online. Questions? Call ${opts.deskPhone}.`,
    active: ['confirmed', 'pending_payment'].includes(b.status),
    policyNote: terms.free
      ? `Free cancellation until ${formatShortDate(freeDay)}, ${hourLabel}.${b.paid ? ` You'd get the full ${formatGhs(b.paid)} back.` : ''}`
      : `You're inside ${opts.freeHours} hours of check-in, so the ${formatGhs(terms.kept)} deposit is kept if you cancel.`,
    cancelBody: b.paid
      ? terms.free
        ? `You're more than ${opts.freeHours} hours out, so this one's free. We'll refund the full ${formatGhs(b.paid)} to ${payWay}.`
        : `You're inside ${opts.freeHours} hours of check-in, so we keep the ${formatGhs(terms.kept)} deposit${terms.refund ? ` and refund ${formatGhs(terms.refund)} to ${payWay}` : ''}.`
      : "Nothing has been paid on this booking, so there's nothing to refund. The room goes back on sale straight away.",
    checkIn: b.checkIn,
    checkOut: b.checkOut,
  };
}
