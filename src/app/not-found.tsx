// Any unknown URL: the 404 inside the public site's header and footer.
import type { Metadata } from 'next';
import SiteLayout from './(site)/layout';
import { NotFoundBody } from '@/components/site/not-found-body';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <SiteLayout>
      <NotFoundBody />
    </SiteLayout>
  );
}
