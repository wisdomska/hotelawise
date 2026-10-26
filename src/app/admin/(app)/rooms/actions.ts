'use server';
// Rooms & rates actions: room types and prices, rate rules, promo codes,
// blocked dates and stay policies. All change website prices, so the site
// cache is refreshed after each one.
import { z } from 'zod';
import { done, fail } from '@/lib/admin/result';
import { formatDayMonth, isIsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { act, read } from '@/server/admin/act';
import {
  addBlackout,
  deletePromo,
  deleteRule,
  removeBlackout,
  roomNumbers,
  savePolicies,
  savePromo,
  saveRoomType,
  saveRule,
  togglePromo,
  toggleRule,
  type PolicyKey,
} from '@/server/admin/rates';

const uuid = z.string().uuid();
const pesewas = (v: string) => Math.round(Number(String(v).replace(/[^\d.]/g, '')) * 100);
const ROOMS = ['all', 'STD', 'EXE', 'VIP', 'DBL'] as const;
const site = { site: true };

export async function loadRoomNumbers() {
  return read('rooms.edit', (d) => roomNumbers(d));
}

export async function saveRoomTypeAction(raw: {
  code: string;
  tier: boolean;
  name: string;
  note: string;
  price: string;
  beds: string;
  sleeps: string;
  bathroom: string;
  bestFor: string;
  amenities: string;
}) {
  const errs: Record<string, string> = {};
  const price = pesewas(raw.price);
  if (raw.name.trim().length < 2) errs.name = raw.tier ? 'Give it a name.' : 'Give the room a name.';
  if (!(price > 0)) errs.price = 'Enter a price above 0.';
  const amenities = raw.amenities
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!raw.tier) {
    if (!raw.beds.trim()) errs.beds = 'Describe the beds.';
    if (!raw.bathroom.trim()) errs.bathroom = 'Describe the bathroom.';
    if (!amenities.length) errs.amenities = 'Add at least one amenity.';
  }
  if (Object.keys(errs).length) return fail('Check the highlighted fields.', errs);
  return act(
    'rooms.edit',
    async (tx, who) => {
      const out = await saveRoomType(tx, who, {
        code: z.string().max(12).parse(raw.code),
        name: raw.name.trim().slice(0, 60),
        price,
        ...(raw.tier
          ? { note: raw.note.trim().slice(0, 120) }
          : {
              beds: raw.beds.trim().slice(0, 60),
              sleeps: z.coerce.number().int().min(1).max(8).parse(raw.sleeps),
              bathroom: raw.bathroom.trim().slice(0, 80),
              bestFor: raw.bestFor.trim().slice(0, 120),
              amenities,
            }),
      });
      return done(
        'Room saved.',
        out.priceChanged
          ? `${formatGhs(out.from)} → ${formatGhs(price)} a night. Live on the website.`
          : 'Live on the website and checkout.',
      );
    },
    site,
  );
}

const md = z.string().regex(/^\d{2}-\d{2}$/);

export async function saveRuleAction(raw: {
  id: string | null;
  name: string;
  kind: string;
  from: string;
  to: string;
  minNights: string;
  rooms: string;
  direction: string;
  unit: string;
  amount: string;
}) {
  const kind = z.enum(['range', 'weekend', 'longstay']).parse(raw.kind);
  const direction = z.enum(['up', 'down']).parse(raw.direction);
  const unit = z.enum(['pct', 'ghs']).parse(raw.unit);
  const errs: Record<string, string> = {};
  if (raw.name.trim().length < 2) errs.name = 'Give the rule a name.';
  const minNights = Math.floor(Number(raw.minNights));
  if (kind === 'longstay' && !(minNights >= 2)) errs.minNights = 'Enter 2 nights or more.';
  if (kind === 'range') {
    if (!isIsoDate(raw.from)) errs.from = 'Pick a date.';
    if (!isIsoDate(raw.to)) errs.to = 'Pick a date.';
  }
  const v = Number(raw.amount);
  if (!(v > 0)) errs.amount = 'Enter a number above 0.';
  else if (unit === 'pct' && v > (direction === 'down' ? 90 : 200))
    errs.amount = direction === 'down' ? 'Keep discounts at 90% or less.' : 'Keep increases at 200% or less.';
  if (Object.keys(errs).length) return fail('Check the highlighted fields.', errs);
  return act(
    'rooms.edit',
    async (tx, who) => {
      await saveRule(tx, who, raw.id ? uuid.parse(raw.id) : null, {
        name: raw.name.trim().slice(0, 60),
        kind,
        from: kind === 'range' ? md.parse(raw.from.slice(5)) : null,
        to: kind === 'range' ? md.parse(raw.to.slice(5)) : null,
        minNights: kind === 'longstay' ? minNights : null,
        rooms: z.enum(ROOMS).parse(raw.rooms),
        direction,
        unit,
        amount: unit === 'pct' ? Math.round(v) : Math.round(v * 100),
      });
      return done('Rule saved.', 'Website prices update straight away.');
    },
    site,
  );
}

export async function toggleRuleAction(id: string) {
  return act(
    'rooms.edit',
    async (tx, who) => {
      const r = await toggleRule(tx, who, uuid.parse(id));
      return done(
        `${r.name}: ${r.active ? 'active' : 'paused'}.`,
        r.active ? 'Prices on the website include it now.' : 'Prices on the website no longer include it.',
      );
    },
    site,
  );
}

export async function deleteRuleAction(id: string) {
  return act(
    'rooms.edit',
    async (tx, who) => {
      await deleteRule(tx, who, uuid.parse(id));
      return done('Rule deleted.');
    },
    site,
  );
}

export async function savePromoAction(raw: {
  id: string | null;
  code: string;
  type: string;
  value: string;
  ends: string;
  until: string;
  rooms: string;
  minNights: string;
}) {
  const type = z.enum(['pct', 'ghs', 'breakfast']).parse(raw.type);
  const code = raw.code.trim().toUpperCase();
  const errs: Record<string, string> = {};
  if (!/^[A-Z0-9]{3,12}$/.test(code)) errs.code = 'Use 3 to 12 letters or numbers, no spaces.';
  const v = Number(raw.value);
  if (type !== 'breakfast') {
    if (!(v > 0)) errs.value = 'Enter a number above 0.';
    else if (type === 'pct' && v > 90) errs.value = 'Keep it at 90% or less.';
  }
  if (raw.ends === 'date' && !isIsoDate(raw.until)) errs.until = 'Pick the last day.';
  const minNights = Math.floor(Number(raw.minNights));
  if (raw.minNights.trim() === '' || !(minNights >= 0)) errs.minNights = 'Enter 0 or more.';
  if (Object.keys(errs).length) return fail('Check the highlighted fields.', errs);
  return act(
    'rooms.edit',
    async (tx, who) => {
      await savePromo(tx, who, raw.id ? uuid.parse(raw.id) : null, {
        code,
        type,
        value: type === 'pct' ? Math.round(v) : type === 'ghs' ? Math.round(v * 100) : 0,
        endsOn: raw.ends === 'date' ? raw.until : null,
        rooms: z.enum(ROOMS).parse(raw.rooms),
        minNights: Math.min(minNights, 60),
      });
      return done(`${code} saved.`, 'Guests can use it at checkout now.');
    },
    site,
  );
}

export async function togglePromoAction(id: string) {
  return act(
    'rooms.edit',
    async (tx, who) => {
      const p = await togglePromo(tx, who, uuid.parse(id));
      return done(
        `${p.code}: ${p.active ? 'active' : 'paused'}.`,
        p.active ? 'Guests can use it again.' : 'Guests can’t use it until you turn it back on.',
      );
    },
    site,
  );
}

export async function deletePromoAction(id: string) {
  return act(
    'rooms.edit',
    async (tx, who) => {
      await deletePromo(tx, who, uuid.parse(id));
      return done('Code deleted.');
    },
    site,
  );
}

export async function blockDatesAction(raw: { from: string; to: string; room: string; reason: string }) {
  const errs: Record<string, string> = {};
  if (!isIsoDate(raw.from)) errs.from = 'Pick the first night.';
  if (!isIsoDate(raw.to)) errs.to = 'Pick the last night.';
  else if (raw.to < raw.from) errs.to = 'End date must be on or after the start.';
  if (!raw.reason.trim()) errs.reason = 'Add a short reason.';
  if (Object.keys(errs).length) return fail('Check the highlighted fields.', errs);
  return act(
    'rooms.edit',
    async (tx, who) => {
      await addBlackout(tx, who, {
        starts: raw.from,
        ends: raw.to,
        room: z
          .string()
          .regex(/^(all|\d{3})$/)
          .parse(raw.room),
        reason: raw.reason.trim().slice(0, 120),
      });
      return done('Dates blocked.', `${formatDayMonth(raw.from)} → ${formatDayMonth(raw.to)}`);
    },
    site,
  );
}

export async function unblockAction(id: string) {
  return act(
    'rooms.edit',
    async (tx, who) => {
      await removeBlackout(tx, who, uuid.parse(id));
      return done('Dates unblocked.', 'They can be booked online again straight away.');
    },
    site,
  );
}

export async function savePoliciesAction(patch: Record<string, string | boolean>) {
  const out: Partial<Record<PolicyKey, string | number>> = {};
  const errs: Record<string, string> = {};
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const [k, v] of Object.entries(patch)) {
    const val = String(v).trim();
    if (k === 'hotel.checkIn' || k === 'hotel.checkOut') {
      if (!time.test(val)) errs[k] = 'Use 24-hour time, like 14:00.';
      else out[k] = val;
    } else if (k === 'booking.depositPercent') {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 0 || n > 100) errs[k] = 'Enter a whole number from 0 to 100.';
      else out[k] = n;
    } else if (k === 'booking.policyText') {
      if (val.length < 10) errs[k] = 'Write the policy guests agree to.';
      else out[k] = val.slice(0, 1000);
    }
  }
  if (Object.keys(errs).length) return fail('Check the highlighted fields.', errs);
  return act(
    'rooms.edit',
    async (tx, who) => {
      await savePolicies(tx, who, out);
      return done('Policies saved.', 'Shown on the website and on every confirmation.');
    },
    site,
  );
}
