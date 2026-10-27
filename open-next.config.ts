import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

// Free-plan setup (no card needed): Workers KV for ISR data, D1 for on-demand
// revalidation tags (revalidateTag from the admin), a SQLite Durable Object queue.
// OpenNext prefers R2 for the incremental cache, but R2 needs a payment method on
// file; KV's eventual consistency is acceptable because every admin edit also
// purges by tag through D1 (DECISIONS D-29).
const config = defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
  // Serve cached pages before Next.js starts up: on the free plan's cold isolates
  // this takes most of the time out of a cached page's first byte.
  enableCacheInterception: true,
});
// Webpack shares server code between pages and route handlers; Turbopack
// bundles it twice, which costs about 300 KiB of the 3 MiB Worker limit.
config.buildCommand = 'pnpm exec next build --webpack';
export default config;
