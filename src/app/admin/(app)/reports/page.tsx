import { ReportsScreen } from '@/components/admin/reports/screen';
import { todayInAccra } from '@/lib/dates';
import { rentalsReport, roomsReport, staffReport } from '@/server/admin/reports';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Reports' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  await requirePage('reports.view');
  const tab = (await searchParams).tab;
  const today = todayInAccra();
  const d = await db();
  // Only the open tab's queries run.
  const [rooms, rentals, staff] = await Promise.all([
    tab === 'Rentals' || tab === 'Staff' ? null : roomsReport(d, today),
    tab === 'Rentals' ? rentalsReport(d, today) : null,
    tab === 'Staff' ? staffReport(d, today) : null,
  ]);
  return <ReportsScreen rooms={rooms} rentals={rentals} staff={staff} />;
}
