import type { Metadata, Viewport } from 'next';
import { cormorant, geist, geistMono } from './fonts';
import './globals.css';

const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: 'Hotel A-Wise · Open all night, every night', template: '%s · Hotel A-Wise' },
  description: 'Affordable luxury in New Asofan, Accra. Comfortable rooms, a front desk that never closes and honest prices.',
  robots: process.env.APP_ENV === 'production' ? undefined : { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000063',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${cormorant.variable} ${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
