import { UsersScreen } from '@/components/admin/users/screens';
import { permissionMatrix, roleLabel, signIns, team } from '@/server/admin/users';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Users & permissions' };

export default async function UsersPage() {
  const actor = await requirePage('users.view');
  const d = await db();
  const [people, perms, history] = await Promise.all([team(d), permissionMatrix(d), signIns(d)]);
  return (
    <UsersScreen
      meId={actor.id}
      team={people.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleLabel: roleLabel(u.role, u.jobTitle),
        isSuper: u.role === 'super_admin',
        twoFactor: u.twoFactor,
        status: u.status,
        lastSignIn: u.lastSignIn,
      }))}
      perms={perms}
      signIns={history}
    />
  );
}
