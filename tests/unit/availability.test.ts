import { describe, expect, it } from 'vitest';
import {
  allocationCounts, freeByNight, freeRooms, orderHoldsStock, rangeBookable, stockForRange, stockOnDate,
  type AllocationLike, type RentalOrderLike, type RoomLike,
} from '@/server/services/availability';

const now = new Date('2026-10-26T12:00:00Z');
const rooms: RoomLike[] = [
  { id: '101', status: 'available' },
  { id: '102', status: 'cleaning' },
  { id: '103', status: 'maintenance' },
];

describe('room availability', () => {
  it('ignores expired holds even before cron cleans them up', () => {
    const expired: AllocationLike = { roomId: '101', checkIn: '2026-10-26', checkOut: '2026-10-27', active: true, holdExpiresAt: new Date('2026-10-26T11:59:00Z') };
    const live: AllocationLike = { ...expired, holdExpiresAt: new Date('2026-10-26T12:10:00Z') };
    expect(allocationCounts(expired, now)).toBe(false);
    expect(allocationCounts(live, now)).toBe(true);
    expect(allocationCounts({ ...live, active: false }, now)).toBe(false);
    expect(freeRooms(rooms, [expired], [], '2026-10-26', '2026-10-27', now).map((r) => r.id)).toEqual(['101', '102']);
    expect(freeRooms(rooms, [live], [], '2026-10-26', '2026-10-27', now).map((r) => r.id)).toEqual(['102']);
  });
  it('takes Maintenance and Out of order rooms off sale, but not Cleaning', () => {
    expect(freeRooms(rooms, [], [], '2026-10-26', '2026-10-27', now).map((r) => r.id)).toEqual(['101', '102']);
  });
  it('allows back-to-back stays', () => {
    const a: AllocationLike = { roomId: '101', checkIn: '2026-10-24', checkOut: '2026-10-26', active: true, holdExpiresAt: null };
    expect(freeRooms(rooms, [a], [], '2026-10-26', '2026-10-28', now)).toHaveLength(2);
  });
  it('applies blackouts to all rooms or to listed rooms', () => {
    expect(freeRooms(rooms, [], [{ starts: '2026-10-27', ends: '2026-10-27', roomIds: null }], '2026-10-26', '2026-10-28', now)).toHaveLength(0);
    expect(freeRooms(rooms, [], [{ starts: '2026-10-27', ends: '2026-10-28', roomIds: ['101'] }], '2026-10-26', '2026-10-28', now).map((r) => r.id)).toEqual(['102']);
  });
  it('blocks ranges that cross a sold-out night', () => {
    const full: AllocationLike[] = ['101', '102'].map((roomId) => ({ roomId, checkIn: '2026-10-27', checkOut: '2026-10-28', active: true, holdExpiresAt: null }));
    const per = freeByNight(rooms, full, [], '2026-10-26', 3, now);
    expect([...per.values()]).toEqual([2, 0, 2]);
    expect(rangeBookable(per, '2026-10-26', '2026-10-27')).toBe(true);
    expect(rangeBookable(per, '2026-10-26', '2026-10-28')).toBe(false);
    expect(rangeBookable(per, '2026-10-26', '2026-11-30')).toBe(false);
  });
});

describe('rental stock', () => {
  const chairs = { id: 'chair', stockTotal: 400, unitsInRepair: 4 };
  const order = (o: Partial<RentalOrderLike>): RentalOrderLike => ({ starts: '2026-10-28', ends: '2026-10-28', status: 'reserved', holdUntil: null, lines: [{ itemId: 'chair', qty: 150 }], ...o });

  it('keeps the day after the end date for returns', () => {
    const orders = [order({})];
    expect(stockOnDate(chairs, orders, '2026-10-27', now)).toBe(396);
    expect(stockOnDate(chairs, orders, '2026-10-28', now)).toBe(246);
    expect(stockOnDate(chairs, orders, '2026-10-29', now)).toBe(246);
    expect(stockOnDate(chairs, orders, '2026-10-30', now)).toBe(396);
  });
  it('takes the minimum across a range and never goes negative', () => {
    const orders = [order({}), order({ starts: '2026-10-30', ends: '2026-10-30', lines: [{ itemId: 'chair', qty: 500 }] })];
    expect(stockForRange(chairs, orders, '2026-10-27', '2026-10-28', now)).toBe(246);
    expect(stockOnDate(chairs, orders, '2026-10-30', now)).toBe(0);
  });
  it('releases cancelled, finished and lapsed pay-at-pickup orders', () => {
    expect(orderHoldsStock(order({ status: 'cancelled' }), now)).toBe(false);
    expect(orderHoldsStock(order({ status: 'returned' }), now)).toBe(false);
    expect(orderHoldsStock(order({ status: 'completed' }), now)).toBe(false);
    expect(orderHoldsStock(order({ holdUntil: new Date('2026-10-26T10:00:00Z') }), now)).toBe(false);
    expect(orderHoldsStock(order({ holdUntil: new Date('2026-10-28T10:00:00Z') }), now)).toBe(true);
    expect(orderHoldsStock(order({ status: 'collected', holdUntil: new Date('2026-10-26T10:00:00Z') }), now)).toBe(true);
  });
});
