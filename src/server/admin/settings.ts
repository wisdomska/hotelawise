// Settings: typed reads and validated writes of the settings table. Each key has
// a kind, so the form can show cedis while the database keeps pesewas, and a
// bad value comes back as a field error rather than breaking the site.
import 'server-only';
import { inArray } from 'drizzle-orm';
import { parseGhanaPhone } from '@/lib/phone';
import { SEED_SETTINGS, type SettingKey } from '@/server/content/defaults';
import * as s from '@/server/db/schema';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';

type Kind =
  | { t: 'text'; max?: number; min?: number }
  | { t: 'phone' }
  | { t: 'email' }
  | { t: 'time' }
  | { t: 'bool' }
  | { t: 'money' }
  | { t: 'int'; min: number; max: number }
  | { t: 'pct'; max: number };

/** Every key the admin can edit, with how it's checked. Others stay seed-only. */
export const SETTING_KINDS: Partial<Record<SettingKey, Kind>> = {
  'contact.phone': { t: 'phone' },
  'contact.phone2': { t: 'phone' },
  'contact.phone3': { t: 'phone' },
  'contact.whatsapp': { t: 'phone' },
  'contact.email': { t: 'email' },
  'contact.address': { t: 'text', min: 5, max: 160 },
  'hotel.checkIn': { t: 'time' },
  'hotel.checkOut': { t: 'time' },
  'hotel.breakfastHours': { t: 'text', min: 3, max: 40 },
  'fees.breakfastPerGuestNightPesewas': { t: 'money' },
  'fees.roomServicePesewas': { t: 'money' },
  'booking.payAtHotel': { t: 'bool' },
  'booking.depositPercent': { t: 'int', min: 0, max: 100 },
  'tax.included': { t: 'bool' },
  'tax.vatPercent': { t: 'pct', max: 50 },
  'tax.nhilPercent': { t: 'pct', max: 50 },
  'tax.getfundPercent': { t: 'pct', max: 50 },
  'tax.tourismPercent': { t: 'pct', max: 50 },
  'notify.smsTemplate': { t: 'text', min: 10, max: 480 },
  'admin.sessionTimeoutMinutes': { t: 'int', min: 5, max: 30 },
  'security.requireTwoFactor': { t: 'bool' },
  'banner.enabled': { t: 'bool' },
  'banner.text': { t: 'text', max: 140 },
};

export const BANNER_KEYS: SettingKey[] = ['banner.enabled', 'banner.text'];

/** The form value for a stored setting (cedis for money, strings for numbers). */
function toForm(kind: Kind, v: unknown): string | boolean {
  if (kind.t === 'bool') return !!v;
  if (kind.t === 'money') return String(Number(v ?? 0) / 100);
  return v == null ? '' : String(v);
}

function fromForm(key: string, kind: Kind, raw: string | boolean): unknown {
  const v = typeof raw === 'string' ? raw.trim() : raw;
  const bad = (msg: string) => {
    throw new AdminError('Check the highlighted fields.', { [key]: msg });
  };
  switch (kind.t) {
    case 'bool':
      return !!v;
    case 'phone': {
      const r = parseGhanaPhone(String(v));
      return r.ok ? r.e164 : bad('Enter a Ghana number, e.g. 0555 557 090.');
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? String(v).toLowerCase() : bad('Enter an email address.');
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? v : bad('Use 24-hour time, e.g. 14:00.');
    case 'money': {
      const n = Number(String(v).replace(/[^\d.]/g, ''));
      return String(v) !== '' && Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : bad('Enter an amount in GHS.');
    }
    case 'int': {
      const n = Number(v);
      return Number.isInteger(n) && n >= kind.min && n <= kind.max ? n : bad(`Enter a whole number from ${kind.min} to ${kind.max}.`);
    }
    case 'pct': {
      const n = Number(v);
      return String(v) !== '' && Number.isFinite(n) && n >= 0 && n <= kind.max
        ? Math.round(n * 100) / 100
        : bad(`Enter a percentage from 0 to ${kind.max}.`);
    }
    case 'text': {
      const t = String(v);
      if (kind.min && t.length < kind.min) bad('This can’t be blank.');
      return t.slice(0, kind.max ?? 500);
    }
  }
}

export async function settingsForm(d: AnyDb, keys: SettingKey[] = Object.keys(SETTING_KINDS) as SettingKey[]) {
  const rows = await d.select().from(s.settings).where(inArray(s.settings.key, keys));
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out: Record<string, string | boolean> = {};
  for (const k of keys) out[k] = toForm(SETTING_KINDS[k]!, k in stored ? stored[k] : SEED_SETTINGS[k]);
  return out;
}

/** Validates and saves only the keys in `allowed`; one audit row for the form. */
export async function saveSettings(
  tx: AnyDb,
  by: Who,
  section: string,
  patch: Record<string, string | boolean>,
  allowed?: readonly SettingKey[],
) {
  const keys = Object.keys(patch) as SettingKey[];
  if (!keys.length) throw new AdminError('Nothing to save.');
  const errs: Record<string, string> = {};
  const values: Partial<Record<SettingKey, unknown>> = {};
  for (const k of keys) {
    const kind = SETTING_KINDS[k];
    if (!kind || (allowed && !allowed.includes(k))) throw new AdminError('That setting can’t be changed here.');
    try {
      values[k] = fromForm(k, kind, patch[k]!);
    } catch (e) {
      if (e instanceof AdminError && e.fields) Object.assign(errs, e.fields);
      else throw e;
    }
  }
  if (Object.keys(errs).length) throw new AdminError('Check the highlighted fields.', errs);
  const before = await settingsForm(tx, keys);
  for (const k of keys) {
    const value = values[k] as never;
    await tx
      .insert(s.settings)
      .values({ key: k, value })
      .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedAt: new Date() } });
  }
  const after = Object.fromEntries(keys.map((k) => [k, toForm(SETTING_KINDS[k]!, values[k])]));
  await audit(tx, {
    actor: by,
    action: 'Settings saved',
    entity: 'settings',
    target: section,
    before: Object.fromEntries(keys.map((k) => [k, before[k]])),
    after,
  });
}

/** Paystack keys live in Worker secrets, so the admin shows them, never edits them. */
export function paystackKeys(reveal: boolean) {
  const pk = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';
  const sk = process.env.PAYSTACK_SECRET_KEY ?? '';
  const mode = (k: string) => (k.includes('_live_') ? 'Live' : k.includes('_test_') ? 'Test' : '');
  const mask = (k: string) => (k ? `${k.slice(0, 8)}${'•'.repeat(12)}${k.slice(-4)}` : 'Not set');
  return {
    public: reveal ? pk || 'Not set' : mask(pk),
    // The secret key is never sent to a browser in full, even revealed.
    secret: sk ? `${sk.slice(0, 8)}${'•'.repeat(12)}${reveal ? sk.slice(-4) : '••••'}` : 'Not set',
    mode: mode(sk) || mode(pk) || 'Not set',
  };
}
