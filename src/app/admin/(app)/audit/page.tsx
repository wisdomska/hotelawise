import { requirePage } from '@/server/auth/session';

// Full Audit log screen arrives in milestone 5; the guard is live now.
export default async function AuditPage() {
  await requirePage('audit.view');
  return <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Audit log</h1>;
}
