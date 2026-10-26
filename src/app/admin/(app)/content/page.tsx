import { ContentScreen } from '@/components/admin/content/screen';
import { contentData } from '@/server/admin/content';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Content' };

export default async function ContentPage() {
  await requirePage('content.edit');
  const data = await contentData(await db());
  return <ContentScreen data={data} />;
}
