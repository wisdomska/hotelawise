// /rent/checkout — who's collecting, then pay online or at pickup.
import type { Metadata } from 'next';
import { RentFlow } from '@/components/checkout/rent-flow';
import { rentProps } from '@/server/content/rent-props';

export const metadata: Metadata = { title: 'Rental checkout', robots: { index: false, follow: false } };

export default async function RentCheckoutPage() {
  return <RentFlow mode="checkout" {...await rentProps()} />;
}
