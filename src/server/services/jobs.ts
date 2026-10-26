// Scheduled jobs, dispatched from the Worker's scheduled() handler. None of them
// is needed for correctness (every query already ignores expired holds); they
// tidy up and send reminders.
import type { CronName } from '@/worker/scheduled';

export async function run(name: CronName, at: Date, env: CloudflareEnv): Promise<void> {
  void env;
  if (!process.env.DATABASE_URL) return;
  const { withTransactionDb } = await import('@/server/platform/db');
  if (name === 'every15') {
    const { sweepExpiredHolds } = await import('./holds');
    const released = await withTransactionDb((db) => sweepExpiredHolds(db, at));
    if (released) console.info(`cron: released ${released} expired hold(s)`);
  }
}
