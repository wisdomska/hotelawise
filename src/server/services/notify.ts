// Guest and staff messages. Sending never decides whether a booking succeeds:
// every function here logs and swallows delivery errors.
import 'server-only';
import { formatDayMonth, formatShortDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhone, formatPhoneLocal } from '@/lib/phone';
import { sendEmail } from '@/server/integrations/email';
import { sendSms } from '@/server/integrations/sms';
import { env } from '@/server/platform/env';
import type { GuestBooking } from './bookings';

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
