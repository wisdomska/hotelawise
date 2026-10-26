// Scheduled jobs, dispatched from the Worker's scheduled() handler.
// Implemented in milestone 3 (holds) and milestone 6 (reminders, housekeeping).
import type { CronName } from '@/worker/scheduled';

export async function run(name: CronName, at: Date, env: CloudflareEnv): Promise<void> {
  void name;
  void at;
  void env;
}
