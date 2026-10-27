// Rental checkout rules (Checkout.dc.html › rentals step 2), shared by page and server.
import { parseGhanaPhone } from './phone';

export const OCCASIONS = ['Wedding', 'Funeral', 'Outdooring', 'Birthday', 'Church event', 'Corporate', 'Other'] as const;

export type CollectorInput = { name: string; phone: string; email: string; occasion: string };
export type CollectorErrors = Partial<Record<'name' | 'phone' | 'email', string>>;

export function checkCollector(c: CollectorInput) {
  const errors: CollectorErrors = {};
  const name = c.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) errors.name = 'Who will collect? We check the name at the desk.';
  else if (name.length > 120) errors.name = 'That name is a little long. Use 120 characters or fewer.';
  const phone = parseGhanaPhone(c.phone);
  if (!phone.ok) errors.phone = "That doesn't look like a Ghana mobile number. Try 0555557090.";
  const email = c.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Check the email address.';
  if (Object.keys(errors).length || !phone.ok) return { ok: false as const, errors };
  const occasion = (OCCASIONS as readonly string[]).includes(c.occasion) ? c.occasion : 'Other';
  return { ok: true as const, value: { name, phoneE164: phone.e164, email: email || null, occasion } };
}

/** Big stock moves in tens on the steppers (Checkout.dc.html: stock ≥ 100 → step 10). */
export const qtyStep = (stockTotal: number) => (stockTotal >= 100 ? 10 : 1);
