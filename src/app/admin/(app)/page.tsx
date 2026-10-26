import { requirePage } from '@/server/auth/session';

export default async function DashboardPage() {
  const actor = await requirePage('dashboard.view');
  const first = actor.name.split(' ')[0];
  return <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Good to see you, {first}</h1>;
}
