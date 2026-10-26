'use client';
// Sonner, styled like the prototype's toasts: dark glass card, lamp dot,
// bottom-right, at most three stacked.
import { Toaster, toast } from 'sonner';

export function AwToaster() {
  return (
    <Toaster
      position="bottom-right"
      visibleToasts={3}
      offset={24}
      mobileOffset={{ bottom: 84, right: 16 }}
      toastOptions={{ unstyled: true }}
    />
  );
}

export function notify(title: string, body?: string) {
  toast.custom(() => (
    <div
      role="status"
      style={{
        width: 'min(360px, calc(100vw - 32px))',
        background: 'rgba(0,0,58,0.72)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: '#F5F2EA',
        borderRadius: 12,
        padding: '14px 16px',
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 12px 32px -12px rgba(0,0,40,0.5)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F2B544', marginTop: 6, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        {body && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{body}</div>}
      </div>
    </div>
  ));
}
