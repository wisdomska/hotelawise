'use client';
// Hover tooltips for anything with data-tip (mouse only, 280 ms delay), placed
// above the element, or below when it sits near the top of the screen.
import { useEffect, useRef, useState } from 'react';
import { EASE } from './ui';

type Tip = { el: Element; text: string; x: number; y: number; b: number; below: boolean };

export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cur = useRef<Tip | null>(null);
  useEffect(() => {
    cur.current = tip;
  }, [tip]);
  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      if (cur.current) setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      const text = el?.getAttribute('data-tip') ?? '';
      clearTimeout(timer.current);
      if (!el || !text) return hide();
      if (cur.current?.el === el) return;
      timer.current = setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        setTip({
          el,
          text,
          x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)),
          y: r.top,
          b: r.bottom,
          below: r.top < 56,
        });
      }, 280);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.x,
        top: tip.below ? tip.b + 8 : tip.y - 8,
        transform: tip.below ? 'translateX(-50%)' : 'translate(-50%,-100%)',
        zIndex: 120,
        maxWidth: 260,
        padding: '6px 10px',
        borderRadius: 8,
        background: 'var(--tip-bg)',
        color: 'var(--tip-fg)',
        fontSize: 12.5,
        lineHeight: 1.4,
        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        animation: `aw-fade 140ms ${EASE}`,
        whiteSpace: 'normal',
        textAlign: 'center',
      }}
    >
      {tip.text}
    </div>
  );
}
