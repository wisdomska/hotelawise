// Bindings and variables available to the Worker (see wrangler.jsonc).
interface CloudflareEnv {
  ASSETS: Fetcher;
  NEXT_INC_CACHE_KV: KVNamespace;
  NEXT_TAG_CACHE_D1: D1Database;
  NEXT_CACHE_DO_QUEUE: DurableObjectNamespace;
  WORKER_SELF_REFERENCE: Fetcher;
  APP_ENV: 'development' | 'preview' | 'production';
  APP_URL: string;
}
