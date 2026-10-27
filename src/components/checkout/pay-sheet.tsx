'use client';
// The Paystack waiting sheet (Checkout.dc.html › payment sheet): "Check your
// phone" while a MoMo prompt is out, the Telecel voucher step, and "confirming"
// after a card payment. It polls the server, which asks Paystack.
import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '@/components/ui/use-scroll-lock';

export type SheetState =
  { stage: 'prompt'; display: string } | { stage: 'otp'; display: string } | { stage: 'card' } | { stage: 'confirming' };

export function KnotSpinner({ size = 52 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="#000063"
      strokeWidth={1.2}
      aria-hidden="true"
      style={{ animation: 'aw-spin 2.4s cubic-bezier(0.77,0,0.175,1) infinite' }}
    >
      <circle cx="11" cy="11" r="5.5" />
      <circle cx="21" cy="11" r="5.5" />
      <circle cx="11" cy="21" r="5.5" />
      <circle cx="21" cy="21" r="5.5" />
      <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
    </svg>
  );
}

export function PaySheet({
  state,
  amount,
  onSubmitOtp,
  onClose,
}: {
  state: SheetState;
  amount: string;
  onSubmitOtp: (code: string) => Promise<string | null>;
  onClose: () => void;
}) {
  useScrollLock(true);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const title =
    state.stage === 'card'
      ? 'Complete payment in the Paystack window.'
      : state.stage === 'confirming'
        ? 'Confirming your payment.'
        : 'Check your phone.';
  const body =
    state.stage === 'card'
      ? 'Enter your card details. 3-D Secure may ask for an OTP.'
      : state.stage === 'confirming'
        ? 'Paystack has the payment. This takes a few seconds.'
        : state.display;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment"
      onKeyDown={(e) => e.key === 'Escape' && state.stage !== 'confirming' && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,40,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'aw-fade 200ms var(--ease-enter)',
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        style={{
          width: 'min(400px,100%)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: '#FFFFFF',
          borderRadius: 22,
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
          outline: 'none',
          animation: 'aw-pop 260ms var(--ease-enter)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(0,0,58,0.55)' }}>
          PAYSTACK · SECURE CHECKOUT
        </span>
        <KnotSpinner />
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: 1.2 }}>{title}</span>
        <span aria-live="polite" style={{ fontSize: 14, color: 'rgba(0,0,58,0.7)' }}>
          {body}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20 }}>{amount}</span>
        {state.stage === 'otp' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(await onSubmitOtp(code));
              setBusy(false);
            }}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              Voucher code from your phone
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ''));
                  setErr(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-invalid={!!err}
                style={{
                  height: 48,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${err ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
                  fontSize: 18,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.2em',
                }}
              />
            </label>
            {err && (
              <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
                {err}
              </span>
            )}
            <button
              type="submit"
              disabled={busy || code.length < 4}
              data-mi-btn="fill"
              style={{
                height: 46,
                border: 'none',
                borderRadius: 10,
                background: '#000063',
                color: '#F5F2EA',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}
        {state.stage !== 'confirming' && (
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(0,0,58,0.6)',
              fontSize: 13,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {state.stage === 'card' ? 'Close' : 'No prompt? Close and try again'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Loads Paystack's popup script once and resumes a transaction started on the server. */
export async function openPaystackPopup(accessCode: string): Promise<'success' | 'cancel'> {
  type Popup = { resumeTransaction: (code: string, cb: { onSuccess: () => void; onCancel: () => void; onError?: () => void }) => void };
  const w = window as unknown as { PaystackPop?: new () => Popup };
  if (!w.PaystackPop) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v2/inline.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Paystack did not load'));
      document.head.appendChild(s);
    });
  }
  return new Promise((resolve) => {
    new w.PaystackPop!().resumeTransaction(accessCode, {
      onSuccess: () => resolve('success'),
      onCancel: () => resolve('cancel'),
      onError: () => resolve('cancel'),
    });
  });
}
