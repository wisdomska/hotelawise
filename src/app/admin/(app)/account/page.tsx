import { notFound } from 'next/navigation';
import { AccountScreen } from '@/components/admin/users/screens';
import { myAccount, recentForUser } from '@/server/admin/users';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'My account' };

export default async function AccountPage() {
  // Every admin has the dashboard, so it stands for "signed in".
  const actor = await requirePage('dashboard.view');
  const d = await db();
  const [a, recent] = await Promise.all([myAccount(d, actor.id), recentForUser(d, actor.id)]);
  if (!a) notFound();
  return (
    <AccountScreen
      a={{
        name: a.name,
        email: a.email,
        roleLabel: a.roleLabel,
        isSuper: a.role === 'super_admin',
        twoFactor: a.twoFactor,
        twoFactorRequired: actor.twoFactorRequired,
        passwordChanged: a.passwordChanged,
        recent,
      }}
    />
  );
}
