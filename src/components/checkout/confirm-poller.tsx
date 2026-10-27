'use client';
// Shown when the guest returns from Paystack before the webhook has landed:
// asks the server (which asks Paystack) until the booking is confirmed.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { paymentState } from '@/app/(site)/(checkout)/pay-actions';
import { KnotSpinner } from './pay-sheet';

export function ConfirmPoller({ payRef, tel, phone }: { payRef: string; tel: string; phone: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let tries = 0;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      tries++;
      const s = await paymentState(payRef, 'card');
      if (s.state === 'confirmed') return router.refresh();
      if (s.state === 'failed' || s.state === 'refunded') return setError(s.error);
      if (tries < 40) setTimeout(tick, 3000);
      else setError('We haven’t heard back from Paystack yet.');
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [payRef, router]);
  return (
    <section aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, maxWidth: 560 }}>
      {!error && <KnotSpinner />}
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 'var(--h2)',
          lineHeight: 1,
          letterSpacing: '-0.05em',
        }}
      >
        {error ? 'Payment not confirmed.' : 'Confirming your payment.'}
      </h1>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
        {error ? (
          <>
            {error} If money left your account, it will come back automatically. Call <a href={tel}>{phone}</a> and the desk will sort it
            out.
          </>
        ) : (
          'Paystack has the payment. This takes a few seconds.'
        )}
      </p>
    </section>
  );
}
