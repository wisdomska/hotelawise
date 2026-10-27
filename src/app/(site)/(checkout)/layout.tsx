// Booking, manage, rentals and venues share the checkout frame (Checkout.dc.html).
import { CheckoutTabs } from '@/components/site/checkout-tabs';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="aw-checkout" style={{ padding: '108px var(--pad) 120px', maxWidth: 1360, margin: '0 auto' }}>
      <CheckoutTabs />
      {children}
    </main>
  );
}
