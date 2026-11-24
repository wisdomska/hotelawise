// Cron Triggers reach the app as an internal request to /api/cron/<job>, so the
// jobs run inside Next.js like any other server code. The request carries a key
// derived from the auth secret; nothing outside the Worker knows it.
export type CronName = 'tidy' | 'daily07' | 'daily02';

export const CRON_NAMES: readonly CronName[] = ['tidy', 'daily07', 'daily02'];

/** The one Cron Trigger each Worker has (wrangler.jsonc): 02:00, 07:00 and 10:00 Accra (UTC). */
export const TRIGGER = '0 2,7,10 * * *';

export function cronName(cron: string): CronName | null {
  // The old 15-minute trigger still maps here, so a deploy that lands mid-switch runs normally.
  if (cron === TRIGGER || cron === '*/15 * * * *') return 'tidy';
  if (cron === '0 7 * * *') return 'daily07';
  if (cron === '0 2 * * *') return 'daily02';
  return null;
}

/**
 * The jobs due for one trigger. Each run wakes the database, and Neon's free plan has a
 * monthly compute allowance, so the trigger fires three times a day rather than every
 * 15 minutes (D-59). Every run tidies lapsed holds and unpaid pay-at-pickup orders (the
 * 10:00 run catches that day's pickups); the 07:00 run adds reminders and the 02:00 run
 * housekeeping. Nothing depends on the tidy-up for correctness: every query already
 * treats expired holds and lapsed orders as released (D-13).
 */
export function cronJobs(cron: string, at: Date): CronName[] {
  const name = cronName(cron);
  if (name !== 'tidy') return name ? [name] : [];
  const jobs: CronName[] = ['tidy'];
  if (at.getUTCMinutes() < 15) {
    if (at.getUTCHours() === 7) jobs.push('daily07');
    if (at.getUTCHours() === 2) jobs.push('daily02');
  }
  return jobs;
}

export async function cronKey(secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`hotel-a-wise cron\n${secret}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex keys. */
export function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
