import { InboxScreen } from '@/components/admin/inbox/screen';
import { assignees, listMessages } from '@/server/admin/inbox';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Inbox' };

export default async function InboxPage() {
  await requirePage('inbox.view');
  const d = await db();
  const [messages, people] = await Promise.all([listMessages(d), assignees(d)]);
  return <InboxScreen messages={messages} people={people} />;
}
