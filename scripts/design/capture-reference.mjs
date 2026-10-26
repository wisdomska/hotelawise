// Captures the design prototypes in /design as visual baselines.
// Usage: node scripts/design/capture-reference.mjs  (serves /design itself)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('design');
const out = path.join(root, 'reference-screens');
fs.mkdirSync(out, { recursive: true });

// Tweak overrides are injected by rewriting each prop's default in data-props.
let overrides = {};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(p);
  if (p.endsWith('.dc.html')) {
    body = body.toString().replace(/data-props="([^"]+)"/, (_, raw) => {
      const props = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      for (const [k, v] of Object.entries(overrides)) if (props[k]) props[k].default = v;
      return `data-props="${JSON.stringify(props).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    });
  }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => server.listen(4599, r));
if (process.env.SERVE_ONLY) { overrides = JSON.parse(process.env.SERVE_ONLY); await new Promise(() => {}); }
const base = 'http://localhost:4599/';

const viewports = { d: { width: 1440, height: 900 }, m: { width: 390, height: 844 } };
const browser = await chromium.launch();
const failures = [];

async function shot(file, hash, name, tweaks = {}) {
  overrides = tweaks;
  for (const [vk, vp] of Object.entries(viewports)) {
    // Reduced motion: the prototype's scroll reveal would otherwise hide off-screen content.
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vk === 'm', hasTouch: vk === 'm', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}${file}${hash ? '#' + hash : ''}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(out, `${name}--${vk === 'd' ? '1440' : '390'}.png`), fullPage: true });
    } catch (e) { failures.push(`${name}/${vk}: ${e.message}`); }
    await ctx.close();
  }
}

const W = 'Website.dc.html', C = 'Checkout.dc.html', A = 'Admin.dc.html';
// Website routes x time of day
for (const t of ['day', 'night']) await shot(W, '', `site-home-${t}`, { timeOfDay: t });
for (const r of ['rooms', 'room/STD', 'room/EXE', 'room/VIP', 'room/DBL', 'gallery', 'contact', 'no-such-page'])
  await shot(W, r, `site-${r.replace('/', '-')}`, { timeOfDay: 'day' });
for (const s of ['loading', 'empty', 'soldout', 'offline']) {
  await shot(W, '', `site-home-state-${s}`, { simulate: s, timeOfDay: 'day' });
  await shot(W, 'rooms', `site-rooms-state-${s}`, { simulate: s, timeOfDay: 'day' });
}
// Checkout routes x states
for (const r of ['book', 'manage', 'rent', 'rent/checkout', 'venues']) await shot(C, r, `checkout-${r.replace('/', '-')}`);
for (const s of ['loading', 'soldout', 'paymentFailed', 'holdExpired', 'notEnoughStock', 'emptyCart', 'offline'])
  for (const r of ['book', 'rent']) await shot(C, r, `checkout-${r}-state-${s}`, { simulate: s });
await shot(C, 'book', 'checkout-book-payAtHotel-off', { payAtHotel: false });
// Admin: every screen x role, light + dark
const screens = ['login', 'dashboard', 'bookings', 'rooms', 'rentals', 'inventory', 'venues', 'payments', 'customers', 'reports', 'content', 'inbox', 'settings', 'users', 'audit'];
for (const role of ['super', 'staff'])
  for (const s of screens) {
    await shot(A, '', `admin-${role}-${s}`, { role, startAt: s, dark: false });
    await shot(A, '', `admin-${role}-${s}-dark`, { role, startAt: s, dark: true });
  }
// Component sheets
for (const f of ['Design System', 'DatePicker', 'Select']) await shot(`${f}.dc.html`, '', `ds-${f.replace(' ', '-').toLowerCase()}`);

await browser.close();
server.close();
console.log(`done, ${fs.readdirSync(out).length} files; failures: ${failures.length}`);
failures.forEach((f) => console.log(' -', f));
