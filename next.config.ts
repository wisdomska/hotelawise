import path from 'node:path';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Set by `pnpm cf:build`: keep local-only modules (node-postgres) out of the Worker.
const workerBuild = process.env.HOTELAWISE_WORKER_BUILD === '1';

const nextConfig: NextConfig = {
  turbopack: {},
  // The Worker is built with webpack (open-next.config.ts), which shares server
  // code between pages and route handlers; Turbopack bundles it twice.
  webpack(config, { isServer, dev }) {
    // Browser script names come from route paths, so route groups put "(" and ")"
    // in them. Some browsers send those percent-encoded, Cloudflare's static file
    // layer redirects to the decoded path, and the script never loads (a redirect
    // loop). Swap the brackets for underscores in browser file names; Next's
    // manifests follow the real names.
    if (!isServer && !dev) {
      const clean = <T>(name: T) => (typeof name === 'string' ? name.replace(/[()]/g, '_') : name);
      for (const key of ['filename', 'chunkFilename'] as const) {
        const orig = config.output[key];
        if (typeof orig === 'string')
          config.output[key] = (data: { chunk?: { name?: string | null } }) =>
            data.chunk?.name ? orig.replace('[name]', clean(data.chunk.name)) : orig;
      }
    }
    if (workerBuild) {
      const stub = path.resolve('src/server/db/node-stub.ts');
      config.resolve.alias = { ...config.resolve.alias, '@/server/db/node$': stub, [path.resolve('src/server/db/node.ts')]: stub };
    }
    return config;
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes is switched on once every linked route exists (milestone 5).
  typedRoutes: false,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
    deviceSizes: [390, 640, 828, 1080, 1280, 1600, 1920],
    imageSizes: [64, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ['date-fns'],
    authInterrupts: true, // forbidden() → 403 page for screens a role can't use
  },
  async headers() {
    // The Content-Security-Policy is set per request in src/proxy.ts; these are the same for every response.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.paystack.com")' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;

if (process.env.NODE_ENV === 'development') {
  void initOpenNextCloudflareForDev();
}
