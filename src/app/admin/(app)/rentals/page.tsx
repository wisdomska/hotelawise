import { RentalsView } from '@/components/admin/rentals/rentals-view';
import { RENTAL_STATUS, type RentalStatus } from '@/lib/admin/labels';
import { addDays, isIsoDate, todayInAccra } from '@/lib/dates';
import { boardOrders, listOrders, ordersBetween } from '@/server/admin/rentals';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function RentalsPage({ searchParams }: { searchParams: Search }) {
  await requirePage('rentals.view');
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const tab = ['Calendar', 'Board'].includes(one('tab')) ? one('tab') : 'List';
  const d = await db();
  const today = todayInAccra();
  if (tab === 'Calendar') {
    const from = isIsoDate(one('from')) ? one('from') : addDays(today, -2);
    return <RentalsView tab="Calendar" today={today} cal={{ from, rows: await ordersBetween(d, from) }} />;
  }
  if (tab === 'Board') return <RentalsView tab="Board" today={today} board={await boardOrders(d)} />;
  const status = one('status') in RENTAL_STATUS ? (one('status') as RentalStatus) : undefined;
  const page = Math.max(0, Math.floor(Number(one('p_orders')) || 0));
  const list = await listOrders(d, { status, page });
  return <RentalsView tab="List" today={today} list={{ ...list, status: status ?? null, page }} />;
}
