// Worker builds alias src/server/db/node.ts to this file (see next.config.ts), so
// node-postgres never ships to Cloudflare. Deployed environments use Neon.
export function createNodeDb(): never {
  throw new Error('DATABASE_DRIVER=pg is for local development only. Use a Neon URL on Workers.');
}
export type NodeDb = never;
