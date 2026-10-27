import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import { freshDb } from './db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/admin/act', () => ({
  AdminError: class AdminError extends Error {
    constructor(
      message: string,
      readonly fields?: Record<string, string>,
    ) {
      super(message);
      this.name = 'AdminError';
    }
  },
}));

const R = await import('@/server/admin/rates');
const B = await import('@/server/admin/bookings');

let h: Awaited<ReturnType<typeof freshDb>>;
const who = { id: '00000000-0000-0000-0000-000000000000', name: 'Esi Asamoah' };

beforeAll(async () => {
  h = await freshDb('admin_rates');
  const [exe] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'EXE', name: 'Executive', beds: 'Large double', sleeps: 2, bathroom: 'En-suite', amenities: ['Wi-Fi'] })
    .returning();
  const [v1, v2] = await h.db
    .insert(s.rateVariants)
    .values([
      { roomTypeId: exe!.id, code: 'EXE', displayCode: 'EXE', name: 'Executive', pricePesewas: 20000, position: 1 },
      { roomTypeId: exe!.id, code: 'EXE_PLUS', displayCode: 'EXE+', name: 'Executive Plus', pricePesewas: 25000, position: 2 },
    ])
    .returning();
  await h.db.insert(s.rooms).values([
    { number: '201', rateVariantId: v1!.id },
    { number: '203', rateVariantId: v2!.id },
  ]);
  // audit rows reference a user; give the actor a real one.
  await h.db.insert(s.user).values({ id: who.id, name: who.name, email: 'esi@example.com', role: 'super_admin' } as never);
});
afterAll(async () => h?.drop());

describe('rooms & rates', () => {
  it('lists room types with their rooms, and marks the tier that borrows details', async () => {
    const rows = await R.roomTypeRows(h.db);
    expect(rows.map((r) => [r.code, r.numbers, r.tier])).toEqual([
      ['EXE', ['201'], false],
      ['EXE_PLUS', ['203'], true],
    ]);
  });

  it('saves a room type: details on the type, the price on the variant', async () => {
    const out = await R.saveRoomType(h.db, who, {
      code: 'EXE',
      name: 'Executive',
      price: 22000,
      beds: 'King bed',
      sleeps: 2,
      bathroom: 'Rain shower',
      bestFor: 'Business',
      amenities: ['Wi-Fi', 'Desk'],
    });
    expect(out).toEqual({ priceChanged: true, from: 20000 });
    const [t] = await h.db.select().from(s.roomTypes).where(eq(s.roomTypes.code, 'EXE'));
    expect(t).toMatchObject({ beds: 'King bed', amenities: ['Wi-Fi', 'Desk'] });
    await R.saveRoomType(h.db, who, { code: 'EXE_PLUS', name: 'Executive Plus', note: 'Corner room', price: 26000 });
    const [plus] = await h.db.select().from(s.rateVariants).where(eq(s.rateVariants.code, 'EXE_PLUS'));
    expect(plus).toMatchObject({ note: 'Corner room', pricePesewas: 26000 });
    expect((await h.db.select().from(s.roomTypes).where(eq(s.roomTypes.code, 'EXE')))[0]!.beds).toBe('King bed');
  });

  it('creates, pauses and deletes a rate rule', async () => {
    await R.saveRule(h.db, who, null, {
      name: 'Easter',
      kind: 'range',
      from: '04-01',
      to: '04-07',
      minNights: null,
      rooms: 'EXE',
      direction: 'up',
      unit: 'pct',
      amount: 20,
    });
    const [rule] = await R.listRules(h.db);
    expect(rule).toMatchObject({ name: 'Easter', appliesTo: ['EXE'], active: true });
    expect(R.ruleChange(rule!)).toBe('+20%');
    expect(await R.toggleRule(h.db, who, rule!.id)).toEqual({ name: 'Easter', active: false });
    await R.deleteRule(h.db, who, rule!.id);
    expect(await R.listRules(h.db)).toHaveLength(0);
  });

  it('refuses a duplicate promo code', async () => {
    const p = { code: 'EASTER10', type: 'pct' as const, value: 10, endsOn: null, rooms: 'all', minNights: 0 };
    await R.savePromo(h.db, who, null, p);
    await expect(R.savePromo(h.db, who, null, p)).rejects.toThrow('already exists');
    const [row] = await R.listPromos(h.db);
    expect(row).toMatchObject({ code: 'EASTER10', appliesTo: null, minNights: null });
    await R.togglePromo(h.db, who, row!.id);
    await R.deletePromo(h.db, who, row!.id);
    expect(await R.listPromos(h.db)).toHaveLength(0);
  });

  it('blocks one room or every room, and unblocks', async () => {
    await R.addBlackout(h.db, who, { starts: '2026-12-01', ends: '2026-12-03', room: '201', reason: 'Repainting' });
    await R.addBlackout(h.db, who, { starts: '2026-12-24', ends: '2026-12-24', room: 'all', reason: 'Private event' });
    const list = await R.listBlackouts(h.db);
    expect(list.map((b) => [b.rooms, b.reason])).toEqual([
      [['201'], 'Repainting'],
      [null, 'Private event'],
    ]);
    await expect(R.addBlackout(h.db, who, { starts: '2026-12-01', ends: '2026-12-01', room: '999', reason: 'x' })).rejects.toThrow();
    for (const b of list) await R.removeBlackout(h.db, who, b.id);
    expect(await R.listBlackouts(h.db)).toHaveLength(0);
  });

  it('saves policies over the defaults', async () => {
    expect((await R.policies(h.db))['hotel.checkIn']).toBe('14:00');
    await R.savePolicies(h.db, who, { 'hotel.checkIn': '13:00', 'booking.depositPercent': 50 });
    expect(await R.policies(h.db)).toMatchObject({ 'hotel.checkIn': '13:00', 'booking.depositPercent': '50' });
    const audits = await h.db.select().from(s.auditLog);
    expect(audits.some((a) => a.action === 'Edited stay policies')).toBe(true);
  });

  it('lists rooms for the timeline', async () => {
    expect(await B.roomRows(h.db)).toEqual([
      { number: '201', name: 'Executive' },
      { number: '203', name: 'Executive Plus' },
    ]);
  });

  it('adds a room, changes its type and refuses a number that exists', async () => {
    expect(await R.addRoom(h.db, who, { number: ' 209 ', type: 'EXE' })).toEqual({ number: '209', type: 'Executive', restored: false });
    await expect(R.addRoom(h.db, who, { number: '209', type: 'EXE' })).rejects.toThrow('already exists');
    await expect(R.addRoom(h.db, who, { number: 'Room 9!', type: 'EXE' })).rejects.toThrow('letters or numbers');
    await expect(R.addRoom(h.db, who, { number: '210', type: 'NOPE' })).rejects.toThrow('Pick a room type');
    expect((await R.changeRoomType(h.db, who, { number: '209', type: 'EXE_PLUS' }, '2026-11-01')).changed).toBe(true);
    expect((await R.roomTypeRows(h.db)).find((t) => t.code === 'EXE_PLUS')!.numbers).toEqual(['203', '209']);
  });

  it('removes a never-booked room for good, and keeps one with history as removed', async () => {
    expect(await R.removeRoom(h.db, who, '209', '2026-11-01')).toEqual({ kept: false });
    expect(await h.db.select().from(s.rooms).where(eq(s.rooms.number, '209'))).toHaveLength(0);

    const [room] = await h.db.select().from(s.rooms).where(eq(s.rooms.number, '201'));
    const [c] = await h.db.insert(s.customers).values({ name: 'Kofi Mensah', phoneE164: '+233244000999' }).returning();
    const [v] = await h.db.select().from(s.rateVariants).where(eq(s.rateVariants.code, 'EXE'));
    const stay = (checkIn: string, checkOut: string) =>
      h.db
        .insert(s.bookings)
        .values({
          ref: `AW-${checkIn.slice(5, 7)}${checkIn.slice(8)}`,
          publicToken: `tok-${checkIn}-xxxxxxxxxxxx`,
          customerId: c!.id,
          rateVariantId: v!.id,
          roomId: room!.id,
          checkIn,
          checkOut,
          guests: 1,
          status: 'confirmed',
          totalPesewas: 20000,
        } as never)
        .returning();
    const [future] = await stay('2026-11-05', '2026-11-06');
    await h.db.insert(s.roomAllocations).values({ bookingId: future!.id, roomId: room!.id, checkIn: '2026-11-05', checkOut: '2026-11-06' });
    await expect(R.removeRoom(h.db, who, '201', '2026-11-01')).rejects.toThrow('upcoming stay');
    await expect(R.changeRoomType(h.db, who, { number: '201', type: 'EXE_PLUS' }, '2026-11-01')).rejects.toThrow('Move it');

    // Once the stay is over the room can go, but its booking keeps the number.
    expect(await R.removeRoom(h.db, who, '201', '2026-12-01')).toEqual({ kept: true });
    expect(await R.removedRooms(h.db)).toEqual(['201']);
    expect((await R.roomTypeRows(h.db)).find((t) => t.code === 'EXE')!.numbers).toEqual([]);
    expect(await R.roomNumbers(h.db)).toEqual(['203']);

    // Adding the number again brings it back.
    expect(await R.addRoom(h.db, who, { number: '201', type: 'EXE' })).toMatchObject({ restored: true });
    expect(await R.removedRooms(h.db)).toEqual([]);
  });
});
