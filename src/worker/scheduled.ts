// Cron Triggers. The job itself runs inside the Next.js app (/api/cron/<job>),
// where the database, settings and senders are set up as for any request.
// Correctness never depends on these running on time: every query already
// treats expired holds and lapsed pay-at-pickup orders as released.
import { cronJobs, cronKey } from '@/lib/cron';

type Fetcher = (req: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>;

export async function runScheduled(cron: string, at: Date, env: CloudflareEnv, ctx: ExecutionContext, fetchApp: Fetcher) {
  const jobs = cronJobs(cron, at);
  if (!jobs.length) return;
  const vars = env as unknown as Record<string, string | undefined>;
  const secret = vars.BETTER_AUTH_SECRET;
  if (!secret) return console.error('cron: BETTER_AUTH_SECRET is not set');
  const base = vars.APP_URL ?? 'https://hotelawise.internal';
  const key = await cronKey(secret);
  // One after the other: each job is short, and a failure in one must not stop the next.
  for (const name of jobs) {
    const res = await fetchApp(
      new Request(`${base}/api/cron/${name}`, { method: 'POST', headers: { 'x-cron-key': key, 'x-cron-at': at.toISOString() } }),
      env,
      ctx,
    );
    if (!res.ok) console.error(`cron: ${name} failed with ${res.status}: ${await res.text()}`);
  }
}
