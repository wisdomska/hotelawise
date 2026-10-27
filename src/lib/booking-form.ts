// Booking-form rules (Checkout.dc.html › step 2 and step 3), shared by the page
// and the server so both say the same thing in the same words.
import { parseGhanaPhone, parseInternationalPhone } from './phone';

export const BOOKING_DIAL_CODES = [
  { value: '+233', label: 'GH +233' },
  { value: '+234', label: 'NG +234' },
  { value: '+225', label: 'CI +225' },
  { value: '+44', label: 'UK +44' },
  { value: '+1', label: 'US +1' },
] as const;

export const ARRIVALS = ['Not sure yet', ...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)];

export const PAY_METHODS = [
  { id: 'mtn', logos: ['mtn'], label: 'MTN MoMo', momo: true },
  { id: 'telecel', logos: ['telecel'], label: 'Telecel Cash', momo: true },
  { id: 'airteltigo', logos: ['airteltigo'], label: 'AirtelTigo Money', momo: true },
  { id: 'card', logos: ['visa', 'mastercard'], label: 'Visa / Mastercard', momo: false },
] as const;
export type PayMethod = (typeof PAY_METHODS)[number]['id'];

export type GuestInput = { name: string; dialCode: string; phone: string; email: string; arrival: string; notes: string };
export type GuestErrors = Partial<Record<'name' | 'phone' | 'email', string>>;
export type GuestClean = { name: string; phoneE164: string; email: string | null; arrivalHour: number | null; requests: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkGuest(g: GuestInput): { ok: true; value: GuestClean } | { ok: false; errors: GuestErrors } {
  const errors: GuestErrors = {};
  const name = g.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) errors.name = 'We’ll need a name for the key.';
  else if (name.length > 120) errors.name = 'That name is a little long. Use 120 characters or fewer.';
  const known = BOOKING_DIAL_CODES.some((d) => d.value === g.dialCode);
  const phone = known ? parseInternationalPhone(g.phone, g.dialCode) : null;
  if (!phone?.ok) errors.phone = g.dialCode === '+233' ? 'Enter a Ghana mobile number, like 0555557090.' : 'Enter a valid phone number.';
  const email = g.email.trim().toLowerCase();
  if (email && (!EMAIL.test(email) || email.length > 254)) errors.email = 'Check the email address.';
  if (Object.keys(errors).length || !phone?.ok) return { ok: false, errors };
  const hour = /^(\d{2}):00$/.exec(g.arrival);
  return {
    ok: true,
    value: {
      name,
      phoneE164: phone.e164,
      email: email || null,
      arrivalHour: hour ? Number(hour[1]) : null,
      requests: g.notes.trim().slice(0, 1000),
    },
  };
}

/** The MoMo number that gets the prompt: a Ghana mobile number. */
export function checkMomo(input: string): { ok: true; e164: string } | { ok: false; error: string } {
  const p = parseGhanaPhone(input);
  return p.ok ? { ok: true, e164: p.e164 } : { ok: false, error: 'Enter the MoMo number that should get the prompt.' };
}
