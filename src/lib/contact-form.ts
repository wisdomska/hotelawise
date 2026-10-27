// Contact form rules (Website.dc.html › submitContact), run in the browser for
// instant feedback and again on the server, which is the one that counts.
import { parseInternationalPhone } from './phone';

export const CONTACT_SUBJECTS = ['Reservation', 'Special request', 'Feedback', 'Events & rentals'] as const;
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
export const DIAL_CODES = [
  { value: '+233', label: 'GH +233' },
  { value: '+234', label: 'NG +234' },
  { value: '+44', label: 'UK +44' },
  { value: '+1', label: 'US +1' },
] as const;

export type ContactInput = { subject: string; name: string; dialCode: string; phone: string; email: string; message: string };
export type ContactField = 'subject' | 'name' | 'phone' | 'email' | 'message';
export type ContactErrors = Partial<Record<ContactField, string>>;
export type ContactClean = { subject: ContactSubject; name: string; phone: string; email: string | null; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkContact(i: ContactInput): { ok: true; value: ContactClean } | { ok: false; errors: ContactErrors } {
  const errors: ContactErrors = {};
  const subject = (CONTACT_SUBJECTS as readonly string[]).includes(i.subject) ? (i.subject as ContactSubject) : null;
  if (!subject) errors.subject = 'Pick a subject.';
  const name = i.name.trim();
  if (!name) errors.name = 'We’d like to know who we’re talking to.';
  else if (name.length > 120) errors.name = 'That name is a little long. Use 120 characters or fewer.';
  const ghana = i.dialCode === '+233';
  const knownCode = DIAL_CODES.some((d) => d.value === i.dialCode);
  const phone = knownCode ? parseInternationalPhone(i.phone, i.dialCode) : null;
  if (!phone?.ok) errors.phone = ghana ? 'Enter a Ghana mobile number, like 0555557090.' : 'Enter a valid phone number.';
  const email = i.email.trim().toLowerCase();
  if (email && (!EMAIL.test(email) || email.length > 254)) errors.email = 'Check the email address.';
  const message = i.message.trim();
  if (message.length < 5) errors.message = 'A few more words, please.';
  else if (message.length > 4000) errors.message = 'That’s a long one. Keep it under 4,000 characters, or call us.';
  if (Object.keys(errors).length || !subject || !phone?.ok) return { ok: false, errors };
  return { ok: true, value: { subject, name, phone: phone.e164, email: email || null, message } };
}
