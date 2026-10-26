import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/server/db/schema';
import { createHold } from '@/server/services/holds';
import { freeRoomsForStay } from '@/server/services/tonight';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
let variantId: string;
let roomIds: string[];

beforeAll(async () => {
  h = await freshDb('stay_availability');
  const [type] = await h.db
    .insert(schema.roomTypes)
    .values({ code: 'DBL', name: 'Double', beds: '2 double beds', sleeps: 4, bathroom: 'Private bathroom' })
    .returning();
  const [variant] = await h.db
    .insert(schema.rateVariants)
    .values({ roomTypeId: type!.id, code: 'DBL', displayCode: 'DBL', name: 'Double', pricePesewas: 40000 })
    .returning();
  variantId = variant!.id;
  const rooms = await h.db
    .insert(schema.rooms)
    .values([
      { number: '107', rateVariantId: variantId },
      { number: '108', rateVariantId: variantId },
    ])
    .returning();
  roomIds = rooms.map((r) => r.id);
});
afterAll(async () => h?.drop());

const now = new Date('2027-03-01T10:00:00Z');
const free = (ci: string, co: string, at = now) => freeRoomsForStay(h.db, 'DBL', ci, co, at);

describe('free rooms for a stay', () => {
  it('counts every sellable room when nothing is booked', async () => {
    expect(await free('2027-03-10', '2027-03-12')).toBe(2);
    expect(await freeRoomsForStay(h.db, 'VIP', '2027-03-10', '2027-03-12', now)).toBe(0);
  });

  it('treats check-out as free: [ci, co) ranges that touch do not overlap', async () => {
    await createHold(h.db, {
      rateVariantId: variantId,
      checkIn: '2027-03-10',
      checkOut: '2027-03-12',
      guests: 2,
      sessionId: 's',
      publicToken: 't1',
      now,
    });
    expect(await free('2027-03-11', '2027-03-13')).toBe(1);
    expect(await free('2027-03-12', '2027-03-14')).toBe(2);
    expect(await free('2027-03-08', '2027-03-10')).toBe(2);
  });

  it('stops counting a hold once it has lapsed', async () => {
    expect(await free('2027-03-10', '2027-03-11', new Date('2027-03-01T10:20:00Z'))).toBe(2);
  });

  it('honours blackouts and rooms taken off sale', async () => {
    await h.db.insert(schema.blackoutDates).values({ starts: '2027-04-05', ends: '2027-04-05', roomIds: [roomIds[0]!] });
    expect(await free('2027-04-04', '2027-04-05')).toBe(2);
    expect(await free('2027-04-05', '2027-04-07')).toBe(1);
    await h.db.update(schema.rooms).set({ status: 'out_of_order' });
    expect(await free('2027-05-01', '2027-05-02')).toBe(0);
  });
});
