// Scheduled jobs, run by /api/cron/<job> when a Cron Trigger fires. None of them
// is needed for correctness (every query already ignores expired holds and
// lapsed pay-at-pickup orders); they tidy up, notify, and send reminders.
import 'server-only';
import type { CronName } from '@/lib/cron';
import { todayInAccra } from '@/lib/dates';

export async function run(name: CronName, at: Date): Promise<Record<string, unknown>> {
  const { withTransactionDb } = await import('@/server/platform/db');
  if (name === 'every15') {
    const { sweepExpiredHolds } = await import('./holds');
    const { releaseUnpaidPickups } = await import('./reminders');
    const holds = await withTransactionDb((db) => sweepExpiredHolds(db, at));
    const orders = await withTransactionDb((db) => releaseUnpaidPickups(db, at));
    return { holds, orders };
  }
  if (name === 'daily07') {
    const { sendReminders } = await import('./reminders');
    return withTransactionDb((db) => sendReminders(db, todayInAccra(at), at));
  }
  if (name === 'daily02') {
    const { housekeeping } = await import('./housekeeping');
    return withTransactionDb((db) => housekeeping(db, at));
  }
  return {};
}
