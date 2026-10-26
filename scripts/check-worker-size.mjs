// Fails CI when the compressed Worker exceeds the plan limit.
// Workers Free: 3 MiB; Workers Paid: 10 MiB. Override with WORKER_MAX_GZIP_KIB.
import { execSync } from 'node:child_process';

const limit = Number(process.env.WORKER_MAX_GZIP_KIB ?? 3072);
const out = execSync('pnpm exec wrangler deploy --dry-run --env preview --outdir .wrangler/dry-run', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const m = out.match(/Total Upload: ([\d.]+) KiB \/ gzip: ([\d.]+) KiB/);
if (!m) {
  console.error(out);
  throw new Error('Could not read the Worker size from wrangler output');
}
const gzip = Number(m[2]);
console.log(`Worker size: ${m[1]} KiB raw, ${gzip} KiB gzip (limit ${limit} KiB)`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Worker size\n\n${gzip} KiB gzip of ${limit} KiB allowed (${((gzip / limit) * 100).toFixed(0)}%)\n`,
  );
}
if (gzip > limit) process.exit(1);
