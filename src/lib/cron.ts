// Cron Triggers reach the app as an internal request to /api/cron/<job>, so the
// jobs run inside Next.js like any other server code. The request carries a key
// derived from the auth secret; nothing outside the Worker knows it.
export type CronName = 'every15' | 'daily07' | 'daily02';

export const CRON_NAMES: readonly CronName[] = ['every15', 'daily07', 'daily02'];

export function cronName(cron: string): CronName | null {
  if (cron === '*/15 * * * *') return 'every15';
  if (cron === '0 7 * * *') return 'daily07';
  if (cron === '0 2 * * *') return 'daily02';
  return null;
}

/**
 * The jobs due for one trigger. The free plan allows 5 Cron Triggers per account, so each
 * Worker has a single 15-minute trigger and the daily jobs ride on the 07:00 and 02:00
 * runs (Accra is UTC, so no conversion). Older dedicated schedules still map as before.
 */
export function cronJobs(cron: string, at: Date): CronName[] {
  const name = cronName(cron);
  if (name !== 'every15') return name ? [name] : [];
  const jobs: CronName[] = ['every15'];
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
