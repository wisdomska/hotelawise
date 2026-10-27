// notFound() inside the public site (e.g. /rooms/xyz); the layout is already around it.
import type { Metadata } from 'next';
import { NotFoundBody } from '@/components/site/not-found-body';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return <NotFoundBody />;
}
