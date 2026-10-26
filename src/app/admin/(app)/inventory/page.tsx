import { InventoryView } from '@/components/admin/rentals/inventory-view';
import { addDays, todayInAccra } from '@/lib/dates';
import { itemsWithToday, unitsOut } from '@/server/admin/rentals';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function InventoryPage({ searchParams }: { searchParams: Search }) {
  await requirePage('inventory.view');
  const tab = (await searchParams).tab === 'Stock by date' ? 'Stock by date' : 'Items';
  const d = await db();
  const today = todayInAccra();
  const items = await itemsWithToday(d, today);
  if (tab === 'Items') return <InventoryView tab="Items" today={today} items={items} />;
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));
  const out = await unitsOut(d, today, days[9]!);
  return <InventoryView tab="Stock by date" today={today} items={items} days={days} out={Object.fromEntries(out)} />;
}
