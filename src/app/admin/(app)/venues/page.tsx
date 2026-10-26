import { VenuesView } from '@/components/admin/rentals/venues-view';
import { addDays, isIsoDate, todayInAccra } from '@/lib/dates';
import { enquiries } from '@/server/admin/rentals';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function VenuesPage({ searchParams }: { searchParams: Search }) {
  await requirePage('venues.view');
  const sp = await searchParams;
  const today = todayInAccra();
  const from = typeof sp.from === 'string' && isIsoDate(sp.from) ? sp.from : addDays(today, -2);
  const rows = await enquiries(await db());
  return <VenuesView today={today} from={from} rows={rows} />;
}
