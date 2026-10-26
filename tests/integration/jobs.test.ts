import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';

vi.mock('server-only', () => ({}));
const SETTINGS: Record<string, unknown> = { 'hotel.checkIn': '14:00', 'rentals.pickupFromHour': 8, 'rentals.returnByHour': 18 };
vi.mock('@/server/content/site-data', () => ({ getSiteDataFresh: async () => ({}), setting: (_: unknown, k: string) => SETTINGS[k] }));
vi.mock('@/server/content/contact', () => ({ contactFrom: () => ({ phone: '055 555 7090', email: 'desk@hotelawise.com' }) }));
const notify = {
  checkInReminder: vi.fn(async () => true),
  pickupReminder: vi.fn(async () => true),
  returnReminder: vi.fn(async () => true),
  orderReleased: vi.fn(async () => undefined),
};
vi.mock('@/server/services/notify', () => notify);

const { releaseUnpaidPickups, sendReminders } = await import('@/server/services/reminders');
const { housekeeping } = await import('@/server/services/housekeeping');
const { createDeskBooking } = await import('@/server/admin/bookings');
const { placeRentalOrder } = await import('@/server/services/rentals');
const { freshDb } = await import('./db');

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'jobs-secret-0123456789';
const TODAY = '2027-03-10';
const SEVEN = new Date('2027-03-10T07:00:00Z');
const desk = { id: 'desk-user', name: 'Kojo Asante' };
let n = 0;

beforeAll(async () => {
  h = await freshDb('jobs');
  await h.db.insert(s.user).values({ id: desk.id, name: desk.name, email: 'kojo@example.com' } as never);
  const [t] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'STD', name: 'Standard', beds: '1 queen', sleeps: 2, bathroom: 'Shower' })
    .returning();
  const [v] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: t!.id, code: 'STD', displayCode: 'STD', name: 'Standard', pricePesewas: 15000 })
    .returning();
  await h.db.insert(s.rooms).values([
    { number: '101', rateVariantId: v!.id },
    { number: '102', rateVariantId: v!.id },
  ]);
  await h.db
    .insert(s.rentalItems)
    .values({ slug: 'canopy', name: 'Canopy', pricePerDayPesewas: 25000, depositPerUnitPesewas: 10000, stockTotal: 6, position: 0 });
});
afterAll(async () => h?.drop());
beforeEach(() => Object.values(notify).forEach((f) => f.mockClear()));

const book = (room: string, checkIn: string) =>
  createDeskBooking(
    h.db,
    desk,
    {
      guest: { name: 'Yaw Darko', phoneE164: '+233244123456', email: null },
      variant: 'STD',
      checkIn,
      nights: 1,
      guests: 1,
      room,
      source: 'phone',
      pay: null,
      refSecret: SECRET,
    },
    new Date('2027-03-09T12:00:00Z'),
  );

const order = (starts: string, ends: string, payMode: 'online' | 'at_pickup' = 'at_pickup') =>
  placeRentalOrder(h.db, {
    starts,
    ends,
    cart: { canopy: 1 },
    packs: [],
    collector: { name: 'Abena Owusu', phoneE164: '+233244000111', email: null },
    occasion: 'Wedding',
    payMode,
    publicToken: `job-${++n}-xxxxxxxxxxxxxxxx`,
    refSecret: SECRET,
    now: new Date('2027-03-01T09:00:00Z'),
  });

describe('07:00 reminders', () => {
  it('reminds tomorrow’s arrivals, pickups and returns once each', async () => {
    const stay = await book('101', '2027-03-11');
    await book('102', '2027-03-12'); // not tomorrow
    const pickup = await order('2027-03-11', '2027-03-11');
    const out = await order('2027-03-09', '2027-03-10');
    await h.db.update(s.rentalOrders).set({ status: 'collected', paidPesewas: out.totalPesewas }).where(eq(s.rentalOrders.id, out.id));

    expect(await sendReminders(h.db, TODAY, SEVEN)).toEqual({ checkIn: 1, pickup: 1, returns: 1 });
    expect(notify.checkInReminder).toHaveBeenCalledWith(expect.objectContaining({ ref: stay.ref }), expect.anything(), '14:00');
    expect(notify.pickupReminder).toHaveBeenCalledWith(expect.objectContaining({ id: pickup.id }), expect.anything(), {
      pickupFrom: 8,
      returnBy: 18,
    });
    expect(notify.returnReminder).toHaveBeenCalledWith(expect.objectContaining({ id: out.id }), expect.anything(), expect.anything());

    // A second run (a retried cron) sends nothing.
    expect(await sendReminders(h.db, TODAY, SEVEN)).toEqual({ checkIn: 0, pickup: 0, returns: 0 });
  });

  it('tries again tomorrow when nothing could be sent', async () => {
    await order('2027-03-11', '2027-03-12');
    notify.pickupReminder.mockResolvedValueOnce(false);
    expect((await sendReminders(h.db, TODAY, SEVEN)).pickup).toBe(0);
    expect((await sendReminders(h.db, TODAY, SEVEN)).pickup).toBe(1);
  });
});

describe('10:00 release of unpaid pay-at-pickup orders', () => {
  it('cancels only unpaid at-pickup orders whose hold has passed, logs and tells the customer', async () => {
    // The reminder tests' pickups on the 11th lapsed long ago.
    expect(await releaseUnpaidPickups(h.db, new Date('2027-03-14T12:00:00Z'))).toBe(2);
    notify.orderReleased.mockClear();
    const lapsed = await order('2027-03-15', '2027-03-15');
    const paid = await order('2027-03-15', '2027-03-15');
    await h.db.update(s.rentalOrders).set({ paidPesewas: paid.totalPesewas }).where(eq(s.rentalOrders.id, paid.id));
    const later = await order('2027-03-16', '2027-03-16');

    expect(await releaseUnpaidPickups(h.db, new Date('2027-03-15T09:59:00Z'))).toBe(0);
    expect(await releaseUnpaidPickups(h.db, new Date('2027-03-15T10:00:00Z'))).toBe(1);
    const rows = await h.db.select().from(s.rentalOrders);
    const status = (id: string) => rows.find((r) => r.id === id)!.status;
    expect([status(lapsed.id), status(paid.id), status(later.id)]).toEqual(['cancelled', 'reserved', 'reserved']);
    const ev = (await h.db.select().from(s.orderStatusEvents).where(eq(s.orderStatusEvents.orderId, lapsed.id))).find(
      (e) => e.to === 'cancelled',
    );
    expect(ev).toMatchObject({ from: 'reserved', to: 'cancelled', reason: 'Not paid by 10:00 on pickup day' });
    const audits = await h.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, lapsed.id));
    expect(audits.map((a) => [a.action, a.actorName])).toContainEqual(['Released unpaid order', 'System']);
    expect(notify.orderReleased).toHaveBeenCalledTimes(1);
    expect(await releaseUnpaidPickups(h.db, new Date('2027-03-15T10:15:00Z'))).toBe(0);
  });
});

describe('02:00 housekeeping', () => {
  it('prunes spent codes, finished limits, expired sessions and old sign-in history only', async () => {
    const now = new Date('2027-03-10T02:00:00Z');
    const old = new Date('2026-01-01T00:00:00Z');
    const soon = new Date('2027-03-10T03:00:00Z');
    await h.db.insert(s.rateLimits).values([
      { key: 'done', count: 3, resetAt: old },
      { key: 'live', count: 1, resetAt: soon },
    ]);
    await h.db.insert(s.verification).values([
      { id: 'v-old', identifier: 'x', value: 'y', expiresAt: old },
      { id: 'v-live', identifier: 'x', value: 'y', expiresAt: soon },
    ] as never);
    await h.db.insert(s.session).values([
      { id: 's-old', token: 't-old', userId: desk.id, expiresAt: old },
      { id: 's-live', token: 't-live', userId: desk.id, expiresAt: soon },
    ] as never);
    await h.db.insert(s.loginEvents).values([
      { userId: desk.id, email: 'kojo@example.com', success: true, at: old },
      { userId: desk.id, email: 'kojo@example.com', success: true, at: now },
    ] as never);

    const swept = await housekeeping(h.db, now);
    expect(swept).toMatchObject({ limits: 1, verifications: 1, sessions: 1, logins: 1 });
    expect((await h.db.select().from(s.rateLimits)).map((r) => r.key)).toEqual(['live']);
    expect((await h.db.select().from(s.session)).map((r) => r.id)).toEqual(['s-live']);
    expect(await h.db.select().from(s.loginEvents)).toHaveLength(1);
  });
});
