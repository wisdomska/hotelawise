// Guest and staff messages. Sending never decides whether a booking succeeds:
// every function here logs and swallows delivery errors.
import 'server-only';
import { addDays, formatDayMonth, formatShortDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhone, formatPhoneLocal } from '@/lib/phone';
import { sendEmail } from '@/server/integrations/email';
import { sendSms } from '@/server/integrations/sms';
import { env } from '@/server/platform/env';
import type { GuestBooking } from './bookings';
import type { GuestOrder } from './rentals';

type Contact = { phone: string; email: string };

async function safely(what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = await fn();
    return r !== false;
  } catch (err) {
    console.error(`notify: ${what} failed`, err);
    return false;
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const manageUrl = (ref: string) => `${env().APP_URL}/manage?ref=${encodeURIComponent(ref)}`;
const confirmUrl = (token: string) => `${env().APP_URL}/book/confirmation/${token}`;

/** Fills the SMS template from Settings › Notifications. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export async function bookingConfirmed(b: GuestBooking, contact: Contact, smsTemplate: string) {
  const room = `${b.variantName} Room`;
  const sms = fillTemplate(smsTemplate, {
    first_name: firstName(b.guestName),
    room,
    check_in: formatDayMonth(b.checkIn),
    check_out: formatDayMonth(b.checkOut),
    ref: b.ref ?? '',
    phone: contact.phone,
  });
  const due = Math.max(0, b.total - b.paid);
  const text = [
    `Hi ${firstName(b.guestName)},`,
    '',
    `You're booked at Hotel A-Wise. We'll leave the light on.`,
    '',
    `Reference: ${b.ref}`,
    `${room}, ${formatShortDate(b.checkIn)} to ${formatShortDate(b.checkOut)} (${b.nights} night${b.nights === 1 ? '' : 's'}), ${b.guests} guest${b.guests === 1 ? '' : 's'}`,
    '',
    ...b.lines.map((l) => `${l.label}: ${formatGhs(l.amount)}`),
    ...(b.discount ? [`Promo ${b.promoCode}: −${formatGhs(b.discount)}`] : []),
    `Total: ${formatGhs(b.total)}`,
    `Paid: ${formatGhs(b.paid)}`,
    `Balance at the desk: ${formatGhs(due)}`,
    '',
    'Check-in from 2pm, check-out by 12 noon. The desk is staffed all night, so arrive whenever you arrive.',
    'No. 1 Wisepak Lane, New Asofan, Accra. Tell your driver "A-Wise, Wisepak Lane".',
    '',
    `Your booking: ${confirmUrl(b.token)}`,
    `Change or cancel: ${manageUrl(b.ref ?? '')}`,
    `Questions? ${contact.phone} or ${contact.email}`,
  ].join('\n');
  await Promise.all([
    safely('booking SMS', () => sendSms(b.phone, sms)),
    b.email ? safely('booking email', () => sendEmail(b.email!, `You're booked: ${b.ref}`, text)) : Promise.resolve(),
  ]);
}

export async function bookingCancelled(b: GuestBooking, refund: number, payWay: string, contact: Contact) {
  const msg =
    refund > 0
      ? `Hotel A-Wise: booking ${b.ref} is cancelled. ${formatGhs(refund)} is on its way back to ${payWay}, usually within 1–3 working days. We'll text you when it lands.`
      : `Hotel A-Wise: booking ${b.ref} is cancelled. We hope to see you another time. ${contact.phone}`;
  await Promise.all([
    safely('cancel SMS', () => sendSms(b.phone, msg)),
    b.email ? safely('cancel email', () => sendEmail(b.email!, `Cancelled: ${b.ref}`, msg)) : Promise.resolve(),
  ]);
}

export async function datesChanged(b: GuestBooking, contact: Contact) {
  const due = Math.max(0, b.total - b.paid);
  const msg = `Hotel A-Wise: booking ${b.ref} now runs ${formatShortDate(b.checkIn)} to ${formatShortDate(b.checkOut)}. New total ${formatGhs(b.total)}${due ? `, ${formatGhs(due)} due at check-in` : ''}. ${contact.phone}`;
  await Promise.all([
    safely('dates SMS', () => sendSms(b.phone, msg)),
    b.email
      ? safely('dates email', () => sendEmail(b.email!, `New dates: ${b.ref}`, `${msg}\n\n${confirmUrl(b.token)}`))
      : Promise.resolve(),
  ]);
}

export async function lateRefund(b: GuestBooking, amount: number, contact: Contact) {
  const msg = `Hotel A-Wise: your payment of ${formatGhs(amount)} arrived after your 15-minute hold ended and the room had been taken, so we've refunded it in full. Sorry. Call ${contact.phone} and the desk will find you something.`;
  await Promise.all([
    safely('late refund SMS', () => sendSms(b.phone, msg)),
    b.email ? safely('late refund email', () => sendEmail(b.email!, 'Your payment has been refunded', msg)) : Promise.resolve(),
  ]);
}

export async function staffAlert(to: string, subject: string, text: string) {
  await safely('staff alert', () => sendEmail(to, `[A-Wise] ${subject}`, text));
}

/** Shows where a code went without revealing the number: "024 ••• ••56". */
export function maskPhone(e164: string): string {
  const local = formatPhoneLocal(e164);
  if (local === e164) return formatPhone(e164).replace(/\d(?=\d{2})/g, '•');
  return `${local.slice(0, 3)} ••• ••${local.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  return `${u!.slice(0, 1)}•••@${d}`;
}

/** Sends a manage-booking code by SMS and, when we have one, email. Returns where it went. */
export async function guestCode(phone: string, email: string | null, code: string): Promise<string[]> {
  const text = `Your Hotel A-Wise code is ${code}. It works for 10 minutes. Don't share it with anyone.`;
  const [bySms, byEmail] = await Promise.all([
    safely('code SMS', () => sendSms(phone, text)),
    email ? safely('code email', () => sendEmail(email, `Your Hotel A-Wise code: ${code}`, text)) : Promise.resolve(false),
  ]);
  return [...(bySms ? [maskPhone(phone)] : []), ...(byEmail && email ? [maskEmail(email)] : [])];
}

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** The rental confirmation wording from Checkout.dc.html (rDoneNote). */
export function rentalNote(o: GuestOrder, hours: { pickupFrom: number; returnBy: number }): string {
  const returnDay = addDays(o.ends, 1);
  return (
    `Reference ${o.ref}. Collect from No. 1 Wisepak Lane, New Asofan, from ${hourLabel(hours.pickupFrom)} on ${formatShortDate(o.starts)}, ` +
    `and bring everything back by ${hourLabel(hours.returnBy)} on ${formatShortDate(returnDay)}. ` +
    (o.payMode === 'online'
      ? "You're fully paid, so just show your reference."
      : `Pay ${formatGhs(o.total)} at the desk when you collect: cash, MoMo or card.`)
  );
}

export async function rentalConfirmed(o: GuestOrder, contact: Contact, hours: { pickupFrom: number; returnBy: number }) {
  const note = rentalNote(o, hours);
  const text = [
    `Hi ${firstName(o.collectorName)},`,
    '',
    'Your rental is reserved at Hotel A-Wise.',
    '',
    note,
    '',
    ...o.lines.map((l) => `${l.name} × ${l.qty}: ${formatGhs(l.amount)}`),
    ...(o.discount ? [`Pack discount: −${formatGhs(o.discount)}`] : []),
    `Refundable deposit: ${formatGhs(o.deposit)}`,
    `Total: ${formatGhs(o.total)}`,
    '',
    `Your order: ${env().APP_URL}/rent/confirmation/${o.token}`,
    `Questions? ${contact.phone}`,
  ].join('\n');
  await Promise.all([
    safely('rental SMS', () => sendSms(o.phone, `Hotel A-Wise: ${note}`)),
    o.email ? safely('rental email', () => sendEmail(o.email!, `Reserved: ${o.ref}`, text)) : Promise.resolve(),
  ]);
}

export async function rentalLateRefund(o: GuestOrder, amount: number, contact: Contact) {
  const msg = `Hotel A-Wise: your payment of ${formatGhs(amount)} for ${o.ref} arrived after the 15-minute hold ended and some items had gone, so we've refunded it in full. Call ${contact.phone} and we'll see what we can do.`;
  await safely('rental refund SMS', () => sendSms(o.phone, msg));
}

/* ───────────── reminders and status updates ───────────── */

/** The day before check-in. */
export async function checkInReminder(b: GuestBooking, contact: Contact, checkInHour: string) {
  const due = Math.max(0, b.total - b.paid);
  const msg =
    `Hotel A-Wise: see you tomorrow, ${firstName(b.guestName)}. ${b.variantName} Room, ref ${b.ref}. ` +
    `Check-in from ${checkInHour}; the desk is open all night.` +
    (due ? ` ${formatGhs(due)} is due at the desk.` : '') +
    ` No. 1 Wisepak Lane, New Asofan. ${contact.phone}`;
  const sent = await Promise.all([
    safely('check-in reminder SMS', () => sendSms(b.phone, msg)),
    b.email
      ? safely('check-in reminder email', () =>
          sendEmail(
            b.email!,
            `See you tomorrow: ${b.ref}`,
            `${msg}\n\nYour booking: ${confirmUrl(b.token)}\nChange or cancel: ${manageUrl(b.ref ?? '')}`,
          ),
        )
      : Promise.resolve(false),
  ]);
  return sent.some(Boolean);
}

/** The day before pickup (DECISIONS D-02). */
export async function pickupReminder(o: GuestOrder, contact: Contact, hours: { pickupFrom: number; returnBy: number }) {
  const due = Math.max(0, o.total - o.paid);
  const msg =
    `Hotel A-Wise: your rental ${o.ref} is ready to collect tomorrow from ${hourLabel(hours.pickupFrom)} at No. 1 Wisepak Lane.` +
    (due ? ` Pay ${formatGhs(due)} when you collect, by 10am, or the items go back on sale.` : ' Just show your reference.') +
    ` ${contact.phone}`;
  const sent = await Promise.all([
    safely('pickup reminder SMS', () => sendSms(o.phone, msg)),
    o.email ? safely('pickup reminder email', () => sendEmail(o.email!, `Collect tomorrow: ${o.ref}`, msg)) : Promise.resolve(false),
  ]);
  return sent.some(Boolean);
}

/** The day before items are due back. */
export async function returnReminder(o: GuestOrder, contact: Contact, hours: { pickupFrom: number; returnBy: number }) {
  const msg = `Hotel A-Wise: please bring rental ${o.ref} back tomorrow by ${hourLabel(hours.returnBy)}. We count everything with you and refund your ${formatGhs(o.deposit)} deposit. ${contact.phone}`;
  const sent = await Promise.all([
    safely('return reminder SMS', () => sendSms(o.phone, msg)),
    o.email ? safely('return reminder email', () => sendEmail(o.email!, `Return tomorrow: ${o.ref}`, msg)) : Promise.resolve(false),
  ]);
  return sent.some(Boolean);
}

/** A pay-at-pickup order that wasn't paid by 10:00 on pickup day. */
export async function orderReleased(o: GuestOrder, contact: Contact) {
  const msg = `Hotel A-Wise: rental ${o.ref} wasn't collected and paid by 10am, so the items have gone back on sale. Call ${contact.phone} and we'll check what's still free.`;
  await Promise.all([
    safely('release SMS', () => sendSms(o.phone, msg)),
    o.email ? safely('release email', () => sendEmail(o.email!, `Released: ${o.ref}`, msg)) : Promise.resolve(),
  ]);
}

/** Order moved forward at the desk (DECISIONS D-16: email every step, SMS when on). */
export async function rentalStatusChanged(
  o: GuestOrder,
  to: 'ready_for_pickup' | 'collected' | 'completed',
  contact: Contact,
  hours: { pickupFrom: number; returnBy: number },
  refund = 0,
) {
  const msg =
    to === 'ready_for_pickup'
      ? `Hotel A-Wise: rental ${o.ref} is ready. Collect from No. 1 Wisepak Lane from ${hourLabel(hours.pickupFrom)} on ${formatShortDate(o.starts)}.`
      : to === 'collected'
        ? `Hotel A-Wise: enjoy your event! Please bring rental ${o.ref} back by ${hourLabel(hours.returnBy)} on ${formatShortDate(addDays(o.ends, 1))}.`
        : `Hotel A-Wise: thanks for returning rental ${o.ref}.` +
          (refund > 0 ? ` ${formatGhs(refund)} of your deposit is on its way back.` : '');
  await Promise.all([
    safely('rental status SMS', () => sendSms(o.phone, `${msg} ${contact.phone}`)),
    o.email
      ? safely('rental status email', () => sendEmail(o.email!, `Rental ${o.ref}`, `${msg}\n\nQuestions? ${contact.phone}`))
      : Promise.resolve(),
  ]);
}
