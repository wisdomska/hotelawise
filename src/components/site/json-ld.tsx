import { ldJson } from '@/server/content/seo';

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />;
}
