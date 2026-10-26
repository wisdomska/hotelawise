// Builds the Worker for one environment:  node scripts/cf-clean-build.mjs --env preview
// - Local env files are set aside. OpenNext copies .env* values into the Worker
//   bundle, so a build on a developer machine would otherwise ship local-only
//   settings (local database, dev secrets). CI never has these files.
// - The environment's public vars from wrangler.jsonc (APP_ENV, APP_URL, …) are
//   set for the build, so pages prerendered at build time (sitemap, share tags)
//   carry the right address.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** JSON with comments and trailing commas → JSON (comment markers inside strings are kept). */
function stripJsonc(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const target = process.argv[process.argv.indexOf('--env') + 1];
if (!process.argv.includes('--env') || !target) {
  console.error('usage: node scripts/cf-clean-build.mjs --env <preview|production>');
  process.exit(2);
}
const wrangler = JSON.parse(stripJsonc(fs.readFileSync('wrangler.jsonc', 'utf8')));
const vars = wrangler.env?.[target]?.vars;
if (!vars) {
  console.error(`wrangler.jsonc has no vars for env "${target}"`);
  process.exit(2);
}

const LOCAL = ['.env.local', '.env.production.local', '.env.development.local'];
const moved = [];
try {
  for (const f of LOCAL) {
    if (fs.existsSync(f)) {
      fs.renameSync(f, `${f}.aside`);
      moved.push(f);
    }
  }
  console.log(`building the ${target} Worker for ${vars.APP_URL}`);
  const r = spawnSync('pnpm', ['run', 'cf:build'], { stdio: 'inherit', env: { ...process.env, ...vars } });
  process.exitCode = r.status ?? 1;
} finally {
  for (const f of moved) fs.renameSync(`${f}.aside`, f);
}
