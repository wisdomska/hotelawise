import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Set by `pnpm cf:build`: keep local-only modules (node-postgres) out of the Worker.
const workerBuild = process.env.HOTELAWISE_WORKER_BUILD === '1';

const nextConfig: NextConfig = {
  turbopack: workerBuild ? { resolveAlias: { '@/server/db/node': './src/server/db/node-stub.ts' } } : {},
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
    // CSP with nonces is set in src/proxy.ts; these are static and safe for every response.
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
