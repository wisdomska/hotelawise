import type { MetadataRoute } from 'next';
import { getSiteData } from '@/server/content/site-data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = process.env.APP_URL ?? 'https://hotelawise.com';
  const data = await getSiteData();
  const pages: [string, number][] = [
    ['/', 1],
    ['/rooms', 0.9],
    ...data.rooms.map((r): [string, number] => [`/rooms/${r.code.toLowerCase()}`, 0.8]),
    ['/rent', 0.7],
    ['/gallery', 0.6],
    ['/contact', 0.6],
  ];
  return pages.map(([path, priority]) => ({ url: `${host}${path}`, changeFrequency: 'weekly', priority }));
}
