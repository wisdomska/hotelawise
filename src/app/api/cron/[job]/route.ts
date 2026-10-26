// The Worker's Cron Trigger calls this from inside the Worker (src/worker/scheduled.ts).
import { CRON_NAMES, cronKey, sameKey, type CronName } from '@/lib/cron';
import { env } from '@/server/platform/env';

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const key = req.headers.get('x-cron-key') ?? '';
  if (!sameKey(key, await cronKey(env().BETTER_AUTH_SECRET))) return new Response('Not found', { status: 404 });
  if (!CRON_NAMES.includes(job as CronName)) return new Response('Unknown job', { status: 404 });
  const at = new Date(req.headers.get('x-cron-at') ?? Date.now());
  const { run } = await import('@/server/services/jobs');
  try {
    const result = await run(job as CronName, Number.isNaN(at.getTime()) ? new Date() : at);
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error(`cron ${job} failed`, e);
    return new Response('Job failed', { status: 500 });
  }
}
