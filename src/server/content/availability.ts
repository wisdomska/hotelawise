// Whether each room type has a room free tonight (1) or is sold out (0), for the room cards.
// Never the count: the owner doesn't show how many rooms are left (D-55). Cached for five
// minutes and tagged 'availability'; holds, bookings and admin changes expire it.
import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { todayInAccra } from '@/lib/dates';
import type { SiteData } from './site-data';

export const AVAILABILITY_TAG = 'availability';

/** Expire the room counts now, so the next visitor sees them recomputed rather than stale. */
export function availabilityChanged() {
  revalidateTag(AVAILABILITY_TAG, { expire: 0 });
}

const cached = unstable_cache(
  async (night: string) => {
    const { db } = await import('@/server/platform/db');
    const { freeRoomsByType } = await import('@/server/services/tonight');
    return freeRoomsByType(await db(), night, new Date());
  },
  ['tonight-v1'],
  { tags: [AVAILABILITY_TAG], revalidate: 300 },
);

export async function leftTonight(data: SiteData): Promise<Record<string, number>> {
  if (!process.env.DATABASE_URL) return Object.fromEntries(data.rooms.map((r) => [r.code, Math.min(1, r.roomNumbers.length)]));
  try {
    const free = await cached(todayInAccra());
    return Object.fromEntries(data.rooms.map((r) => [r.code, Math.min(1, free[r.code] ?? 0)]));
  } catch {
    // Never take the home page down for a counter; show no badge instead.
    return {};
  }
}
