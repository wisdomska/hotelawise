// "N left tonight" for the room cards: cached for five minutes and tagged
// 'availability', which every booking, hold and room-status change revalidates.
import 'server-only';
import { unstable_cache } from 'next/cache';
import { todayInAccra } from '@/lib/dates';
import type { SiteData } from './site-data';

export const AVAILABILITY_TAG = 'availability';

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
  if (!process.env.DATABASE_URL) return Object.fromEntries(data.rooms.map((r) => [r.code, r.roomNumbers.length]));
  try {
    const free = await cached(todayInAccra());
    return Object.fromEntries(data.rooms.map((r) => [r.code, free[r.code] ?? 0]));
  } catch {
    // Never take the home page down for a counter; show no badge instead.
    return {};
  }
}
