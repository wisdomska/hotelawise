import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · A-Wise Admin' },
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('aw_theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <div className="admin min-h-dvh bg-[var(--bg)] text-[var(--ink)]" data-theme={theme} style={{ colorScheme: theme }}>
      {children}
    </div>
  );
}
