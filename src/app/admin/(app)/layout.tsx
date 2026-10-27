// Signed-in admin: the shell from Admin.dc.html, with the sidebar built from the
// same permission map the server enforces, live to-do badges and the user's
// idle timeout.
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell, type NavGroup, type QuickKey, type UmStat } from '@/components/admin/shell';
import type { AnyIconName } from '@/components/ui/icon';
import { SEED_SETTINGS } from '@/server/content/defaults';
import * as s from '@/server/db/schema';
import { pendingSetup } from '@/server/auth/actor';
import { can, capabilitiesOf, visibleScreens } from '@/server/auth/permissions';
import { currentActor } from '@/server/auth/session';
import { shellCounts, type ShellCounts } from '@/server/admin/shell-data';
import { db } from '@/server/platform/db';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, AnyIconName> = {
  dashboard: 'home',
  bookings: 'bed',
  rooms: 'key',
  customers: 'users',
  inbox: 'inbox',
  rentals: 'pkg',
  inventory: 'box',
  venues: 'building',
  payments: 'wallet',
  reports: 'chart',
  content: 'image',
  settings: 'sliders',
  users: 'id',
  audit: 'file',
};

const ZERO: ShellCounts = { pendingBookings: 0, newMessages: 0, rentalsToDo: 0, pickupsToday: 0, newEnquiries: 0, refundsToApprove: 0 };

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor || !actor.active) redirect('/admin/login');
  const step = pendingSetup(actor);
  if (step) redirect(`/admin/login?setup=${step}`);

  const d = await db();
  const [counts, timeoutRow] = await Promise.all([
    shellCounts(d).catch(() => ZERO),
    d.select({ value: s.settings.value }).from(s.settings).where(eq(s.settings.key, 'admin.sessionTimeoutMinutes')),
  ]);
  const badge: Record<string, [number, boolean]> = {
    bookings: [counts.pendingBookings, false],
    inbox: [counts.newMessages, true],
    rentals: [counts.rentalsToDo, false],
    venues: [counts.newEnquiries, false],
    payments: [counts.refundsToApprove, true],
  };
  const screens = visibleScreens(actor);
  const groups: NavGroup[] = [...new Set(screens.map((x) => x.group))].map((label) => ({
    label,
    items: screens
      .filter((x) => x.group === label)
      .map((x) => ({
        key: x.key,
        href: x.href,
        label: x.label,
        icon: ICONS[x.key] ?? 'info',
        badge: badge[x.key]?.[0] ?? 0,
        amber: badge[x.key]?.[1] ?? false,
      })),
  }));
  const isSuper = actor.role === 'super_admin';
  const stats: UmStat[] = [
    { n: counts.pendingBookings, label: 'Awaiting payment', href: '/admin/bookings?status=pending_payment' },
    { n: counts.newMessages, label: 'New messages', href: '/admin/inbox' },
    isSuper
      ? { n: counts.refundsToApprove, label: 'Refunds to approve', href: '/admin/payments?tab=Refunds' }
      : { n: counts.pickupsToday, label: 'Pickups today', href: '/admin/rentals' },
  ];
  const quick: QuickKey[] = [
    ...(can(actor, 'bookings.create') ? (['newBooking'] as const) : []),
    ...(can(actor, 'rentals.create') ? (['newRental'] as const) : []),
    ...(can(actor, 'rooms.edit') ? (['blockDates'] as const) : []),
    ...(can(actor, 'inventory.edit') ? (['addItem'] as const) : []),
  ];
  const initials = actor.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const jar = await cookies();
  const timeout = Number(timeoutRow[0]?.value ?? SEED_SETTINGS['admin.sessionTimeoutMinutes']) || 30;

  return (
    <AdminShell
      me={{
        name: actor.name,
        email: actor.email,
        initials,
        isSuper,
        roleShort: isSuper ? 'Super Admin' : 'Staff',
        roleLabel: isSuper ? 'Super Admin' : `Staff${actor.jobTitle ? ` · ${actor.jobTitle}` : ''}`,
      }}
      capabilities={capabilitiesOf(actor)}
      groups={groups}
      stats={stats}
      quick={quick}
      timeoutMinutes={timeout}
      collapsed={jar.get('aw_side')?.value === '1'}
      theme={jar.get('aw_theme')?.value === 'dark' ? 'dark' : 'light'}
    >
      {children}
    </AdminShell>
  );
}
