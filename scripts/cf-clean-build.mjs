// Builds the Worker without local env files. OpenNext copies .env* values into
// the Worker bundle, so a build on a developer machine would ship local-only
// settings (local database, dev secrets) to Cloudflare. CI never has these
// files; this makes a manual deploy behave the same way.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const LOCAL = ['.env.local', '.env.production.local', '.env.development.local'];
const moved = [];
try {
  for (const f of LOCAL) {
    if (fs.existsSync(f)) {
      fs.renameSync(f, `${f}.aside`);
      moved.push(f);
    }
  }
  const r = spawnSync('pnpm', ['run', 'cf:build'], { stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
} finally {
  for (const f of moved) fs.renameSync(`${f}.aside`, f);
}
