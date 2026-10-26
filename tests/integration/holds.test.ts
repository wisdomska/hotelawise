import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { confirmHold, createHold, NoRoomAvailableError, releaseHold, sweepExpiredHolds } from '@/server/services/holds';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
let vipId: string;
let roomIds: string[];

beforeAll(async () => {
  h = await freshDb('holds');
  const [type] = await h.db
    .insert(schema.roomTypes)
    .values({ code: 'VIP', name: 'VIP', beds: 'Large double bed', sleeps: 2, bathroom: 'VIP bathroom' })
    .returning();
  const [variant] = await h.db
    .insert(schema.rateVariants)
    .values({ roomTypeId: type!.id, code: 'VIP', displayCode: 'VIP', name: 'VIP', pricePesewas: 30000 })
    .returning();
  vipId = variant!.id;
  const rooms = await h.db
    .insert(schema.rooms)
    .values([
      { number: '206', rateVariantId: vipId },
      { number: '207', rateVariantId: vipId },
      { number: '208', rateVariantId: vipId },
    ])
    .returning();
  roomIds = rooms.map((r) => r.id);
});
afterAll(async () => h?.drop());

let n = 0;
const hold = (checkIn: string, checkOut: string, now?: Date) =>
  createHold(h.db, {
    rateVariantId: vipId,
    checkIn,
    checkOut,
    guests: 2,
    sessionId: 's',
    publicToken: `tok-${++n}`,
    ...(now ? { now } : {}),
  });

describe('room holds (database-enforced)', () => {
  it('assigns the first free room in number order', async () => {
    const a = await hold('2027-01-10', '2027-01-12');
    expect(a.roomId).toBe(roomIds[0]);
    const b = await hold('2027-01-11', '2027-01-13');
    expect(b.roomId).toBe(roomIds[1]);
    const c = await hold('2027-01-12', '2027-01-14'); // back-to-back with a: room 206 is free again
    expect(c.roomId).toBe(roomIds[0]);
  });

  it('rejects a direct overlapping insert at the database level', async () => {
    const [b] = await h.db
      .insert(schema.bookings)
      .values({
        publicToken: 'raw',
        rateVariantId: vipId,
        roomId: roomIds[0],
        checkIn: '2027-01-10',
        checkOut: '2027-01-11',
        status: 'confirmed',
      })
      .returning();
    await expect(
      h.db.insert(schema.roomAllocations).values({ bookingId: b!.id, roomId: roomIds[0]!, checkIn: '2027-01-10', checkOut: '2027-01-11' }),
    ).rejects.toMatchObject({ cause: { code: '23P01' } });
  });

  it('20 parallel buyers for the last free room: exactly one wins', async () => {
    // Fill 206 and 207 for the night, leaving 208 as the last room.
    await hold('2027-02-01', '2027-02-02');
    await hold('2027-02-01', '2027-02-02');
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => hold('2027-02-01', '2027-02-02')));
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    for (const l of lost) expect((l as PromiseRejectedResult).reason).toBeInstanceOf(NoRoomAvailableError);
    const overlaps = await h.db.execute(sql`
      select count(*)::int as n from room_allocations a join room_allocations b
        on a.room_id = b.room_id and a.booking_id < b.booking_id and a.active and b.active and a.stay && b.stay`);
    expect(overlaps.rows[0]).toEqual({ n: 0 });
  });

  it('ignores lapsed holds without waiting for cron, and cron tidies them', async () => {
    const t0 = new Date('2026-10-26T12:00:00Z');
    for (let i = 0; i < 3; i++) await hold('2027-03-01', '2027-03-02', t0);
    await expect(hold('2027-03-01', '2027-03-02', new Date(t0.getTime() + 14 * 60_000))).rejects.toBeInstanceOf(NoRoomAvailableError);
    const later = new Date(t0.getTime() + 16 * 60_000);
    const fresh = await hold('2027-03-01', '2027-03-02', later);
    expect(fresh.roomId).toBe(roomIds[0]);
    const stale = await hold('2027-03-05', '2027-03-06', t0);
    expect(await sweepExpiredHolds(h.db, later)).toBeGreaterThanOrEqual(1);
    const [row] = await h.db.select().from(schema.roomAllocations).where(eq(schema.roomAllocations.bookingId, stale.bookingId));
    expect(row!.active).toBe(false);
    expect(await sweepExpiredHolds(h.db, later)).toBe(0);
  });

  it('confirms only live holds and releases on request', async () => {
    const t0 = new Date('2026-10-26T12:00:00Z');
    const a = await hold('2027-04-01', '2027-04-03', t0);
    expect(await confirmHold(h.db, a.bookingId, new Date(t0.getTime() + 20 * 60_000))).toBe(false);
    const b = await hold('2027-04-10', '2027-04-12', t0);
    expect(await confirmHold(h.db, b.bookingId, new Date(t0.getTime() + 5 * 60_000))).toBe(true);
    const [alloc] = await h.db.select().from(schema.roomAllocations).where(eq(schema.roomAllocations.bookingId, b.bookingId));
    expect(alloc!.holdExpiresAt).toBeNull();
    const c = await hold('2027-04-20', '2027-04-21');
    await releaseHold(h.db, c.bookingId);
    const [bk] = await h.db.select().from(schema.bookings).where(eq(schema.bookings.id, c.bookingId));
    expect(bk!.status).toBe('expired');
  });

  it('skips rooms in maintenance and blacked-out nights', async () => {
    await h.db.update(schema.rooms).set({ status: 'maintenance' }).where(eq(schema.rooms.number, '206'));
    const a = await hold('2027-05-01', '2027-05-02');
    expect(a.roomId).toBe(roomIds[1]);
    await h.db.insert(schema.blackoutDates).values({ starts: '2027-05-10', ends: '2027-05-10', reason: 'Buy-out' });
    await expect(hold('2027-05-09', '2027-05-11')).rejects.toBeInstanceOf(NoRoomAvailableError);
    await expect(hold('2027-05-01', '2027-05-01')).rejects.toBeInstanceOf(RangeError);
    await h.db.update(schema.rooms).set({ status: 'available' }).where(eq(schema.rooms.number, '206'));
  });
});

describe('database guards', () => {
  it('never lets the last active Super Admin go', async () => {
    await h.db.insert(schema.user).values({ id: 'u1', name: 'Esi', email: 'esi@hotelawise.com', role: 'super_admin' });
    await expect(h.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, 'u1'))).rejects.toThrow();
    await expect(h.db.update(schema.user).set({ role: 'staff' }).where(eq(schema.user.id, 'u1'))).rejects.toThrow();
    await expect(h.db.delete(schema.user).where(eq(schema.user.id, 'u1'))).rejects.toThrow();
    await h.db.insert(schema.user).values({ id: 'u2', name: 'Second', email: 'two@hotelawise.com', role: 'super_admin' });
    await h.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, 'u1'));
  });
  it('keeps the audit log append-only', async () => {
    await h.db.insert(schema.auditLog).values({ actorName: 'Esi', action: 'Changed rate', entity: 'rate_variant' });
    await expect(h.db.delete(schema.auditLog)).rejects.toThrow();
  });
  it('requires alt text before a gallery photo is published', async () => {
    await expect(
      h.db.insert(schema.galleryItems).values({ imageId: 'x', alt: '  ', category: 'Rooms', published: true }),
    ).rejects.toThrow();
    await h.db.insert(schema.galleryItems).values({ imageId: 'x', alt: '', category: 'Rooms', published: false });
  });
  it('ties each payment to exactly one booking, order or enquiry', async () => {
    await expect(
      h.db.insert(schema.payments).values({ ref: 'P1', amountPesewas: 100, channel: 'desk', status: 'success' }),
    ).rejects.toThrow();
  });
});
