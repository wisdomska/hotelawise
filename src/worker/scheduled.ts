// Cron jobs. Correctness never depends on these running on time: every query
// already treats expired holds as expired. These jobs only tidy up and notify.
export type CronName = 'every15' | 'daily07' | 'daily02';

export function cronName(cron: string): CronName | null {
  if (cron === '*/15 * * * *') return 'every15';
  if (cron === '0 7 * * *') return 'daily07';
  if (cron === '0 2 * * *') return 'daily02';
  return null;
}

export async function runScheduled(cron: string, at: Date, env: CloudflareEnv): Promise<void> {
  const name = cronName(cron);
  if (!name) return;
  // Imported lazily so the fetch path never pays for job code.
  const jobs = await import('@/server/services/jobs');
  await jobs.run(name, at, env);
}
