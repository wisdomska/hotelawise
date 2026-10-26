// Rooms & rates for Super Admins: room types and their nightly price, rate
// rules, promo codes, blocked dates and the stay policies. Every change shows
// on the website straight away (callers revalidate the site) and writes one
// audit row.
import 'server-only';
import { asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { SEED_SETTINGS } from '@/server/content/defaults';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';

/* ───────────── room types ───────────── */

export type RoomTypeRow = {
  code: string;
  displayCode: string;
  name: string;
  note: string | null;
  price: number;
  numbers: string[];
  sleeps: number;
  beds: string;
  bathroom: string;
  bestFor: string;
  amenities: string[];
  /** The variant shares its room type's details with another variant (EXE+ with EXE). */
  tier: boolean;
};

export async function roomTypeRows(db: AnyDb): Promise<RoomTypeRow[]> {
  const [vs, rs] = await Promise.all([
    db
      .select({
        code: s.rateVariants.code,
        displayCode: s.rateVariants.displayCode,
        name: s.rateVariants.name,
        note: s.rateVariants.note,
        price: s.rateVariants.pricePesewas,
        typeCode: s.roomTypes.code,
        sleeps: s.roomTypes.sleeps,
        beds: s.roomTypes.beds,
        bathroom: s.roomTypes.bathroom,
        bestFor: s.roomTypes.bestFor,
        amenities: s.roomTypes.amenities,
        position: s.rateVariants.position,
      })
      .from(s.rateVariants)
      .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
      .orderBy(asc(s.rateVariants.position)),
    db
      .select({ number: s.rooms.number, code: s.rateVariants.code })
      .from(s.rooms)
      .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.rooms.rateVariantId))
      .where(ne(s.rooms.status, 'retired'))
      .orderBy(asc(s.rooms.number)),
  ]);
  return vs.map((v) => ({
    code: v.code,
    displayCode: v.displayCode,
    name: v.name,
    note: v.note,
    price: v.price,
    numbers: rs.filter((r) => r.code === v.code).map((r) => r.number),
    sleeps: v.sleeps,
    beds: v.beds,
    bathroom: v.bathroom,
    bestFor: v.bestFor,
    amenities: v.amenities,
    tier: v.code !== v.typeCode,
  }));
}

export async function saveRoomType(
  db: AnyDb,
  by: Who,
  input: {
    code: string;
    name: string;
    note?: string;
    price: number;
    beds?: string;
    sleeps?: number;
    bathroom?: string;
    bestFor?: string;
    amenities?: string[];
  },
) {
  const [v] = await db
    .select({ id: s.rateVariants.id, name: s.rateVariants.name, price: s.rateVariants.pricePesewas, typeId: s.rateVariants.roomTypeId })
    .from(s.rateVariants)
    .where(eq(s.rateVariants.code, input.code));
  if (!v) throw new AdminError('That room type no longer exists.');
  const [t] = await db.select().from(s.roomTypes).where(eq(s.roomTypes.id, v.typeId));
  const tier = t?.code !== input.code;
  await db
    .update(s.rateVariants)
    .set({ name: input.name, pricePesewas: input.price, ...(tier ? { note: input.note ?? null } : {}) })
    .where(eq(s.rateVariants.id, v.id));
  if (!tier && t) {
    await db
      .update(s.roomTypes)
      .set({
        name: input.name,
        beds: input.beds ?? t.beds,
        sleeps: input.sleeps ?? t.sleeps,
        bathroom: input.bathroom ?? t.bathroom,
        bestFor: input.bestFor ?? t.bestFor,
        amenities: input.amenities ?? t.amenities,
      })
      .where(eq(s.roomTypes.id, t.id));
  }
  await audit(db, {
    actor: by,
    action: 'Edited room type',
    entity: 'rate_variant',
    entityId: v.id,
    target: input.name,
    before: { name: v.name, price: v.price },
    after: { name: input.name, price: input.price },
  });
  return { priceChanged: v.price !== input.price, from: v.price };
}

/* ───────────── rate rules ───────────── */

export type RuleInput = {
  name: string;
  kind: 'range' | 'weekend' | 'longstay';
  from: string | null; // MM-DD
  to: string | null;
  minNights: number | null;
  rooms: string; // 'all' or a variant code
  direction: 'up' | 'down';
  unit: 'pct' | 'ghs';
  amount: number; // percent, or pesewas
};

export async function listRules(db: AnyDb) {
  return db.select().from(s.rateRules).orderBy(desc(s.rateRules.active), asc(s.rateRules.createdAt));
}

export function ruleChange(r: { direction: string; unit: string; amount: number }) {
  return (r.direction === 'down' ? '−' : '+') + (r.unit === 'pct' ? `${r.amount}%` : `${formatGhs(r.amount)} a night`);
}

export async function saveRule(db: AnyDb, by: Who, id: string | null, input: RuleInput) {
  const values = {
    name: input.name,
    kind: input.kind,
    monthDayFrom: input.kind === 'range' ? input.from : null,
    monthDayTo: input.kind === 'range' ? input.to : null,
    minNights: input.kind === 'longstay' ? input.minNights : null,
    appliesTo: input.rooms === 'all' ? null : [input.rooms],
    direction: input.direction,
    unit: input.unit,
    amount: input.amount,
  };
  let ruleId = id;
  if (id) {
    const [old] = await db.select().from(s.rateRules).where(eq(s.rateRules.id, id));
    if (!old) throw new AdminError('That rule no longer exists.');
    await db.update(s.rateRules).set(values).where(eq(s.rateRules.id, id));
  } else {
    const [row] = await db.insert(s.rateRules).values(values).returning({ id: s.rateRules.id });
    ruleId = row!.id;
  }
  await audit(db, {
    actor: by,
    action: id ? 'Edited rate rule' : 'Added rate rule',
    entity: 'rate_rule',
    entityId: ruleId,
    target: input.name,
    after: { change: ruleChange(input) },
  });
}

export async function toggleRule(db: AnyDb, by: Who, id: string) {
  const [r] = await db.select().from(s.rateRules).where(eq(s.rateRules.id, id));
  if (!r) throw new AdminError('That rule no longer exists.');
  await db.update(s.rateRules).set({ active: !r.active }).where(eq(s.rateRules.id, id));
  await audit(db, {
    actor: by,
    action: 'Rate rule',
    entity: 'rate_rule',
    entityId: id,
    target: r.name,
    before: { status: r.active ? 'Active' : 'Paused' },
    after: { status: r.active ? 'Paused' : 'Active' },
  });
  return { name: r.name, active: !r.active };
}

export async function deleteRule(db: AnyDb, by: Who, id: string) {
  const [r] = await db.delete(s.rateRules).where(eq(s.rateRules.id, id)).returning();
  if (!r) throw new AdminError('That rule no longer exists.');
  await audit(db, { actor: by, action: 'Deleted rate rule', entity: 'rate_rule', entityId: id, target: r.name });
}

/* ───────────── promo codes ───────────── */

export type PromoInput = {
  code: string;
  type: 'pct' | 'ghs' | 'breakfast';
  value: number; // percent, or pesewas
  endsOn: IsoDate | null;
  rooms: string;
  minNights: number;
};

export function promoWhat(p: { type: string; value: number }) {
  return p.type === 'pct' ? `${p.value}% off the room` : p.type === 'ghs' ? `${formatGhs(p.value)} off` : 'Free breakfast';
}

export async function listPromos(db: AnyDb) {
  return db.select().from(s.promoCodes).orderBy(desc(s.promoCodes.createdAt));
}

export async function savePromo(db: AnyDb, by: Who, id: string | null, input: PromoInput) {
  const [clash] = await db.select({ id: s.promoCodes.id }).from(s.promoCodes).where(eq(s.promoCodes.code, input.code));
  if (clash && clash.id !== id) throw new AdminError('That code already exists.', { code: 'That code already exists.' });
  const values = {
    code: input.code,
    type: input.type,
    value: input.type === 'breakfast' ? 0 : input.value,
    endsOn: input.endsOn,
    appliesTo: input.rooms === 'all' ? null : input.rooms,
    minNights: input.minNights || null,
  };
  let promoId = id;
  if (id) {
    const [r] = await db.update(s.promoCodes).set(values).where(eq(s.promoCodes.id, id)).returning({ id: s.promoCodes.id });
    if (!r) throw new AdminError('That code no longer exists.');
  } else {
    const [r] = await db.insert(s.promoCodes).values(values).returning({ id: s.promoCodes.id });
    promoId = r!.id;
  }
  await audit(db, {
    actor: by,
    action: id ? 'Edited promo code' : 'Created promo code',
    entity: 'promo_code',
    entityId: promoId,
    target: input.code,
    after: { discount: promoWhat(values) },
  });
}

export async function togglePromo(db: AnyDb, by: Who, id: string) {
  const [p] = await db.select().from(s.promoCodes).where(eq(s.promoCodes.id, id));
  if (!p) throw new AdminError('That code no longer exists.');
  await db.update(s.promoCodes).set({ active: !p.active }).where(eq(s.promoCodes.id, id));
  await audit(db, {
    actor: by,
    action: 'Promo code',
    entity: 'promo_code',
    entityId: id,
    target: p.code,
    before: { status: p.active ? 'Active' : 'Paused' },
    after: { status: p.active ? 'Paused' : 'Active' },
  });
  return { code: p.code, active: !p.active };
}

export async function deletePromo(db: AnyDb, by: Who, id: string) {
  const [p] = await db.delete(s.promoCodes).where(eq(s.promoCodes.id, id)).returning();
  if (!p) throw new AdminError('That code no longer exists.');
  await audit(db, { actor: by, action: 'Deleted promo code', entity: 'promo_code', entityId: id, target: p.code });
}

/* ───────────── blocked dates ───────────── */

export async function listBlackouts(db: AnyDb) {
  const [rows, rooms] = await Promise.all([
    db.select().from(s.blackoutDates).orderBy(asc(s.blackoutDates.starts)),
    db.select({ id: s.rooms.id, number: s.rooms.number }).from(s.rooms),
  ]);
  const num = new Map(rooms.map((r) => [r.id, r.number]));
  return rows.map((b) => ({
    id: b.id,
    starts: b.starts,
    ends: b.ends,
    rooms: b.roomIds?.length ? b.roomIds.map((id) => num.get(id) ?? '?').sort() : null,
    reason: b.reason,
  }));
}

export async function roomNumbers(db: AnyDb) {
  return (await db.select({ number: s.rooms.number }).from(s.rooms).where(ne(s.rooms.status, 'retired')).orderBy(asc(s.rooms.number))).map(
    (r) => r.number,
  );
}

export async function addBlackout(db: AnyDb, by: Who, input: { starts: IsoDate; ends: IsoDate; room: string; reason: string }) {
  let roomIds: string[] | null = null;
  if (input.room !== 'all') {
    const [r] = await db.select({ id: s.rooms.id }).from(s.rooms).where(eq(s.rooms.number, input.room));
    if (!r) throw new AdminError('That room doesn’t exist.', { room: 'Pick a room.' });
    roomIds = [r.id];
  }
  const [row] = await db
    .insert(s.blackoutDates)
    .values({ starts: input.starts, ends: input.ends, roomIds, reason: input.reason })
    .returning({ id: s.blackoutDates.id });
  await audit(db, {
    actor: by,
    action: 'Blocked dates',
    entity: 'blackout',
    entityId: row!.id,
    target: input.room === 'all' ? 'All rooms' : `Room ${input.room}`,
    after: { dates: `${formatDayMonth(input.starts)} → ${formatDayMonth(input.ends)}`, reason: input.reason },
  });
}

export async function removeBlackout(db: AnyDb, by: Who, id: string) {
  const [b] = await db.delete(s.blackoutDates).where(eq(s.blackoutDates.id, id)).returning();
  if (!b) throw new AdminError('Those dates are already unblocked.');
  await audit(db, {
    actor: by,
    action: 'Unblocked dates',
    entity: 'blackout',
    entityId: id,
    target: b.roomIds?.length ? `${b.roomIds.length} room${b.roomIds.length > 1 ? 's' : ''}` : 'All rooms',
    before: { dates: `${formatDayMonth(b.starts)} → ${formatDayMonth(b.ends)}` },
  });
}

/* ───────────── policies ───────────── */

export const POLICY_KEYS = ['hotel.checkIn', 'hotel.checkOut', 'booking.depositPercent', 'booking.policyText'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

export async function savePolicies(db: AnyDb, by: Who, patch: Partial<Record<PolicyKey, string | number>>) {
  const keys = Object.keys(patch) as PolicyKey[];
  if (!keys.length) return;
  const before = await db.select().from(s.settings).where(inArray(s.settings.key, keys));
  for (const k of keys) {
    await db
      .insert(s.settings)
      .values({ key: k, value: patch[k] as never })
      .onConflictDoUpdate({ target: s.settings.key, set: { value: patch[k] as never } });
  }
  await audit(db, {
    actor: by,
    action: 'Edited stay policies',
    entity: 'settings',
    target: keys.join(', '),
    before: Object.fromEntries(before.map((r) => [r.key, r.value])),
    after: patch,
  });
}

export async function upcomingBlackoutCount(db: AnyDb, today: IsoDate) {
  const rows = await db.select({ ends: s.blackoutDates.ends, n: count() }).from(s.blackoutDates).groupBy(s.blackoutDates.ends);
  return rows.filter((r) => r.ends >= today).reduce((t, r) => t + Number(r.n), 0);
}

export async function policies(db: AnyDb): Promise<Record<PolicyKey, string>> {
  const rows = await db
    .select()
    .from(s.settings)
    .where(inArray(s.settings.key, [...POLICY_KEYS]));
  const got = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(POLICY_KEYS.map((k) => [k, String(got.get(k) ?? SEED_SETTINGS[k])])) as Record<PolicyKey, string>;
}

/* ───────────── rooms ───────────── */

const ROOM_NUMBER = /^[0-9A-Z]{1,6}$/;

/** Stays that still need this room: a guest in it now, or any booking from today on. */
async function staysNeedingRoom(db: AnyDb, roomId: string, today: IsoDate) {
  const [row] = await db
    .execute(
      sql`
    select count(*)::int as n from room_allocations a
     where a.room_id = ${roomId} and a.active and a.check_out > ${today}::date`,
    )
    .then((r) => rowsOf<{ n: number }>(r));
  return row?.n ?? 0;
}

async function variantByCode(db: AnyDb, code: string) {
  const [v] = await db
    .select({ id: s.rateVariants.id, name: s.rateVariants.name })
    .from(s.rateVariants)
    .where(eq(s.rateVariants.code, code));
  if (!v) throw new AdminError('Pick a room type.', { type: 'Pick a room type.' });
  return v;
}

/** Adds a room, or brings back a removed one with the same number. */
export async function addRoom(db: AnyDb, by: Who, input: { number: string; type: string }) {
  const number = input.number.trim().toUpperCase();
  if (!ROOM_NUMBER.test(number))
    throw new AdminError('Use up to 6 letters or numbers, like 209.', { number: 'Use up to 6 letters or numbers, like 209.' });
  const v = await variantByCode(db, input.type);
  const [old] = await db.select().from(s.rooms).where(eq(s.rooms.number, number));
  if (old && old.status !== 'retired') throw new AdminError(`Room ${number} already exists.`, { number: `Room ${number} already exists.` });
  let id: string;
  if (old) {
    await db.update(s.rooms).set({ status: 'available', rateVariantId: v.id }).where(eq(s.rooms.id, old.id));
    id = old.id;
  } else {
    const [row] = await db.insert(s.rooms).values({ number, rateVariantId: v.id }).returning({ id: s.rooms.id });
    id = row!.id;
  }
  await audit(db, {
    actor: by,
    action: old ? 'Restored room' : 'Added room',
    entity: 'room',
    entityId: id,
    target: number,
    after: { type: v.name },
  });
  return { number, type: v.name, restored: !!old };
}

/** Moves a room to another type. Refused while it has a guest or upcoming stays. */
export async function changeRoomType(db: AnyDb, by: Who, input: { number: string; type: string }, today: IsoDate) {
  const [r] = await db
    .select({ id: s.rooms.id, status: s.rooms.status, from: s.rateVariants.name, fromId: s.rateVariants.id })
    .from(s.rooms)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.rooms.rateVariantId))
    .where(eq(s.rooms.number, input.number));
  if (!r || r.status === 'retired') throw new AdminError('That room doesn’t exist.');
  const v = await variantByCode(db, input.type);
  if (v.id === r.fromId) return { number: input.number, type: v.name, changed: false };
  const busy = await staysNeedingRoom(db, r.id, today);
  if (busy)
    throw new AdminError(
      `Room ${input.number} has ${busy} stay${busy > 1 ? 's' : ''} booked as ${r.from}. Move ${busy > 1 ? 'them' : 'it'} to another room first.`,
    );
  await db.update(s.rooms).set({ rateVariantId: v.id }).where(eq(s.rooms.id, r.id));
  await audit(db, {
    actor: by,
    action: 'Changed room type',
    entity: 'room',
    entityId: r.id,
    target: input.number,
    before: { type: r.from },
    after: { type: v.name },
  });
  return { number: input.number, type: v.name, changed: true };
}

/**
 * Takes a room out for good. A room that was never booked is deleted; one with
 * history is marked removed, so past bookings and reports keep their room number.
 */
export async function removeRoom(db: AnyDb, by: Who, number: string, today: IsoDate) {
  const [r] = await db.select().from(s.rooms).where(eq(s.rooms.number, number));
  if (!r || r.status === 'retired') throw new AdminError('That room doesn’t exist.');
  const busy = await staysNeedingRoom(db, r.id, today);
  if (busy)
    throw new AdminError(
      `Room ${number} has ${busy} current or upcoming stay${busy > 1 ? 's' : ''}. Move ${busy > 1 ? 'them' : 'it'} to another room, or set it to Out of order for now.`,
    );
  const [{ n: history } = { n: 0 }] = await db.select({ n: count() }).from(s.bookings).where(eq(s.bookings.roomId, r.id));
  const [{ n: allocs } = { n: 0 }] = await db.select({ n: count() }).from(s.roomAllocations).where(eq(s.roomAllocations.roomId, r.id));
  const keep = Number(history) > 0 || Number(allocs) > 0;
  if (keep) await db.update(s.rooms).set({ status: 'retired' }).where(eq(s.rooms.id, r.id));
  else await db.delete(s.rooms).where(eq(s.rooms.id, r.id));
  await audit(db, {
    actor: by,
    action: 'Removed room',
    entity: 'room',
    entityId: r.id,
    target: number,
    after: { kept: keep ? 'history kept' : 'deleted' },
  });
  return { kept: keep };
}

/** Rooms taken out with their history kept; they can be added back. */
export async function removedRooms(db: AnyDb) {
  return (await db.select({ number: s.rooms.number }).from(s.rooms).where(eq(s.rooms.status, 'retired')).orderBy(asc(s.rooms.number))).map(
    (r) => r.number,
  );
}
