// Stands in for an admin screen that isn't built yet, so the sidebar never leads
// to a 404. The permission check still applies; each real screen's own page
// replaces this as it lands (a fixed route wins over this dynamic one).
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { SCREENS } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';

export default async function ComingScreen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const s =
    SCREENS.find((x) => x.key === screen) ?? (screen === 'account' ? { label: 'My account', needs: 'dashboard.view' as const } : null);
  if (!s) notFound();
  await requirePage(s.needs);
  return (
    <>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 'var(--admin-h1)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {s.label}
      </h1>
      <div
        role="status"
        style={{
          padding: '48px 24px',
          border: '1px dashed var(--line2)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--chip-bg)',
            color: 'var(--chip-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="wrench" size={20} />
        </span>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>This screen is being built</span>
        <span style={{ fontSize: 14, color: 'var(--mute)', maxWidth: 520, lineHeight: 1.5 }}>
          {s.label} arrives in the next few updates. Bookings and orders made on the website are already being saved, and will show here
          when it’s ready.
        </span>
      </div>
    </>
  );
}
