import { DashboardView } from '@/components/admin/dashboard/view';
import { accraHour, todayInAccra } from '@/lib/dates';
import { arrivalsAndDepartures } from '@/server/admin/bookings';
import { awaitingPayment, last30, tonightByRate } from '@/server/admin/dashboard';
import { enquiries, pickupsAndReturns } from '@/server/admin/rentals';
import { can } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const actor = await requirePage('dashboard.view');
  const today = todayInAccra();
  const d = await db();
  const [series, tonight, desk, rentals, owed, events] = await Promise.all([
    last30(d, today),
    tonightByRate(d, today),
    arrivalsAndDepartures(d, today),
    pickupsAndReturns(d, today),
    awaitingPayment(d),
    can(actor, 'venues.view') ? enquiries(d, { from: today, upcomingOnly: true, limit: 5 }) : Promise.resolve([]),
  ]);
  const money = can(actor, 'dashboard.revenue') || can(actor, 'reports.view');
  return (
    <DashboardView
      first={actor.name.split(' ')[0] ?? ''}
      hour={accraHour()}
      today={today}
      money={money}
      series={money ? series : { ...series, rooms: [], rentals: [] }}
      tonight={tonight}
      desk={desk}
      rentals={rentals}
      owed={money ? owed : { count: owed.count, owed: 0 }}
      events={events}
    />
  );
}
