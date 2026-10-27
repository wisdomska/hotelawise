'use client';
// The admin toast: a navy card with the lamp dot (dark mode: graphite),
// bottom-right, three at most, gone after four seconds.
import { toast } from 'sonner';

export function adminToast(title: string, body?: string) {
  toast.custom(
    () => (
      <div
        role="status"
        style={{
          width: 'min(360px, calc(100vw - 32px))',
          background: 'var(--toast-bg, #00003A)',
          color: '#F5F2EA',
          borderRadius: 10,
          padding: '12px 14px',
          boxShadow: '0 12px 32px -12px rgba(0,0,0,0.5)',
          display: 'flex',
          gap: 10,
          fontFamily: 'var(--font-sans)',
          border: '1px solid rgba(245,242,234,0.1)',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F2B544', marginTop: 6, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
          {body ? <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>{body}</div> : null}
        </div>
      </div>
    ),
    { duration: 4000 },
  );
}
