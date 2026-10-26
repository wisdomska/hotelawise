// /rent — canopies, tables and chairs to reserve and collect (Checkout.dc.html › RENTALS CATALOGUE).
import type { Metadata } from 'next';
import { RentFlow } from '@/components/checkout/rent-flow';
import { isIsoDate } from '@/lib/dates';
import { rentProps } from '@/server/content/rent-props';

export const metadata: Metadata = {
  title: 'Rentals',
  description:
    'Canopies, tables and chairs for weddings, funerals and parties in Accra. Reserve online, collect from New Asofan, and pay online or at pickup.',
  alternates: { canonical: '/rent' },
};

type Search = Record<string, string | string[] | undefined>;

export default async function RentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = typeof sp.from === 'string' ? sp.from : typeof sp.date === 'string' ? sp.date : '';
  const from = isIsoDate(raw) ? raw : null;
  const to = typeof sp.to === 'string' && isIsoDate(sp.to) ? sp.to : from;
  return <RentFlow mode="catalogue" {...await rentProps()} initialRange={from ? { from, to: to! } : null} />;
}
