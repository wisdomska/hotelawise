// Fails when a page's font classes aren't defined in the stylesheets that page loads.
// next/font puts one class per font on <html> (Cormorant, Geist, Geist Mono) and defines it
// in the CSS. If the two disagree, every heading silently falls back to sans; that shipped
// once, on the deployed build only (DECISIONS D-56).
//
//   node scripts/check-fonts.mjs                 the build output in .next (or a dir given)
//   node scripts/check-fonts.mjs https://…       the live site, after a deploy
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2] ?? '.next';
const live = /^https?:\/\//.test(target);
const PAGES = live ? ['/', '/rooms', '/contact'] : ['_not-found.html', 'index.html'];

async function read(path) {
  if (!live) return readFileSync(path, 'utf8');
  const res = await fetch(new URL(path, target), { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

// Only the stylesheets the page itself links: a stray CSS file elsewhere in the build can
// define the right class and still never reach the page.
const linkedCss = (html) =>
  [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) =>
    live ? m[1] : join(target, m[1].slice('/_next/'.length)),
  );

async function check() {
  const failures = [];
  const pages = live ? PAGES : PAGES.map((f) => join(target, 'server/app', f)).filter(existsSync);
  if (!pages.length) throw new Error(`No prerendered page under ${target}/server/app; run the build first.`);
  for (const page of pages) {
    const html = await read(page);
    const sheets = linkedCss(html);
    if (!sheets.length) failures.push(`${page}: links no stylesheets`);
    const css = (await Promise.all(sheets.map(read))).join('\n');
    const tag = html.match(/<html[^>]*class="([^"]*)"/);
    const classes = (tag?.[1] ?? '').split(/\s+/).filter((c) => /variable/.test(c));
    if (!classes.length) failures.push(`${page}: no font classes on <html>`);
    for (const c of classes) {
      const rule = css.match(new RegExp(`\\.${c.replace(/[^\w-]/g, '\\$&')}\\{([^}]*)\\}`));
      if (!rule) failures.push(`${page}: <html> uses .${c}, but none of the page's stylesheets defines it`);
      else console.log(`ok  ${page}  .${c} → ${rule[1].split(':')[0]}`);
    }
  }
  return failures;
}

// A fresh deploy can take a few seconds to reach every edge, so the live check tries again.
let failures = [];
for (let attempt = 1; attempt <= (live ? 4 : 1); attempt++) {
  failures = await check().catch((e) => [String(e.message ?? e)]);
  if (!failures.length) break;
  if (live && attempt < 4) await new Promise((r) => setTimeout(r, 15_000));
}
if (failures.length) {
  console.error(`\nFont check failed: the page and its CSS disagree, so text falls back to the wrong font.\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Font check passed (${live ? target : 'build output'}).`);
