'use client';
// Contact page › Questions people actually ask: one answer open at a time.
import { useState } from 'react';

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ borderTop: '1.5px solid #000063' }}>
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q} style={{ borderBottom: '1px solid rgba(0,0,99,0.14)' }}>
            <h3 style={{ margin: 0, font: 'inherit' }}>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={on}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(on ? null : i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '18px 0',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 21,
                  lineHeight: 1.2,
                  minHeight: 44,
                  color: '#00003A',
                }}
              >
                <span>{f.q}</span>
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18,
                    transition: 'transform 200ms var(--ease-enter)',
                    transform: `rotate(${on ? 45 : 0}deg)`,
                  }}
                >
                  +
                </span>
              </button>
            </h3>
            {on && (
              <p
                id={`faq-a-${i}`}
                role="region"
                aria-labelledby={`faq-q-${i}`}
                style={{
                  margin: '0 0 20px',
                  maxWidth: 620,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'rgba(0,0,58,0.75)',
                  animation: 'aw-fade 220ms var(--ease-enter)',
                }}
              >
                {f.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
