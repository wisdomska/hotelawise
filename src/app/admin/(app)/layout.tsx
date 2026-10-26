// Signed-in admin shell: role-aware sidebar built from the same permission map
// the server enforces. Full port of Admin.dc.html arrives in milestone 5.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NyansapoMark } from '@/components/ui/nyansapo-mark';
import { pendingSetup } from '@/server/auth/actor';
import { visibleScreens } from '@/server/auth/permissions';
import { currentActor } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor || !actor.active) redirect('/admin/login');
  const step = pendingSetup(actor);
  if (step) redirect(`/admin/login?setup=${step}`);
  const screens = visibleScreens(actor);
  const groups = [...new Set(screens.map((s) => s.group))];
  return (
    <div className="grid min-h-dvh grid-cols-1 desk:grid-cols-[248px_minmax(0,1fr)]">
      <nav aria-label="Admin" className="hidden flex-col gap-4 bg-[var(--side)] p-4 text-paper desk:flex">
        <div className="flex items-center gap-2 font-serif text-xl">
          <NyansapoMark size={24} /> A-Wise Admin
        </div>
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 font-mono text-[11px] tracking-[0.08em] uppercase opacity-60">{g}</p>
            <ul className="m-0 list-none p-0">
              {screens
                .filter((s) => s.group === g)
                .map((s) => (
                  <li key={s.key}>
                    <Link href={s.href} className="block rounded-[var(--radius-control)] px-3 py-2 text-sm text-paper no-underline hover-hover:bg-white/5">
                      {s.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      <main className="p-[var(--admin-pad)]">{children}</main>
    </div>
  );
}
