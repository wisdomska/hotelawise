// Phone numbers are stored in E.164 ("+233555557090"). Ghana is the default country.
export const GH_MOBILE_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '50', '53', '54', '55', '56', '57', '59'] as const;

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

const GH_ERROR = "That doesn't look like a Ghana number. Try 024 412 3456 or +233 24 412 3456.";

/** Normalises a Ghana number written as 0XX…, 233XX…, +233XX… or XX… (9 digits). */
export function parseGhanaPhone(input: string): PhoneResult {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (!/^\d+$/.test(d)) return { ok: false, error: GH_ERROR };
  if (d.startsWith('233')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 9) return { ok: false, error: GH_ERROR };
  const prefix = d.slice(0, 2);
  const isMobile = (GH_MOBILE_PREFIXES as readonly string[]).includes(prefix);
  const isLandline = /^3[0-9]$/.test(prefix);
  if (!isMobile && !isLandline) return { ok: false, error: GH_ERROR };
  return { ok: true, e164: `+233${d}` };
}

/** Any country: "+" followed by a country code and 7–14 more digits. */
export function parseInternationalPhone(input: string, dialCode: string): PhoneResult {
  const cc = dialCode.replace(/\D/g, '');
  if (cc === '233') return parseGhanaPhone(input);
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else d = cc + d.replace(/^0+/, '');
  if (!/^\d{8,15}$/.test(d)) return { ok: false, error: 'Enter the full number, including the area code.' };
  return { ok: true, e164: `+${d}` };
}

/** "+233 55 555 7090", the format the prototype prints. */
export function formatPhone(e164: string): string {
  if (e164.startsWith('+233') && e164.length === 13) {
    const n = e164.slice(4);
    return `+233 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return e164;
}

/** "055 555 7090", the local form used in admin tables. */
export function formatPhoneLocal(e164: string): string {
  if (e164.startsWith('+233') && e164.length === 13) {
    const n = '0' + e164.slice(4);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return e164;
}

export function telHref(e164: string): string {
  return `tel:${e164}`;
}

export function whatsappHref(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/^\+/, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
