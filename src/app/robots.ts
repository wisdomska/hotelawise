import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const production = process.env.APP_ENV === 'production';
  const host = process.env.APP_URL ?? 'https://hotelawise.com';
  if (!production) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/manage', '/book/confirmation', '/rent/confirmation'] }],
    sitemap: `${host}/sitemap.xml`,
  };
}
