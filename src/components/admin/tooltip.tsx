'use client';
// Hover tooltips for anything with data-tip (mouse only, 280 ms delay). They
// sit above the element (below when there's no room above), or to its right
// with data-tip-side="right" (the collapsed sidebar). The bubble is measured
// once rendered and kept at least 8px inside the window on every side.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EASE } from './ui';

const EDGE = 8;
const GAP = 8;

type Rect = { top: number; right: number; bottom: number; left: number; width: number; height: number };
type Tip = { el: Element; text: string; r: Rect; side: 'right' | 'auto' };
export type Placement = { left: number; top: number };

/** Where a bubble of size w×h goes next to the anchor, kept inside a vw×vh window. */
export function placeTip(r: Rect, w: number, h: number, vw: number, vh: number, side: 'right' | 'auto'): Placement {
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - w - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(vh - h - EDGE, y));
  if (side === 'right' && r.right + GAP + w <= vw - EDGE) return { left: r.right + GAP, top: clampY(r.top + r.height / 2 - h / 2) };
  const left = clampX(r.left + r.width / 2 - w / 2);
  const above = r.top - GAP - h;
  if (above >= EDGE) return { left, top: above };
  const below = r.bottom + GAP;
  if (below + h <= vh - EDGE) return { left, top: below };
  return { left, top: clampY(above) };
}

export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cur = useRef<Tip | null>(null);
  useEffect(() => {
    cur.current = tip;
  }, [tip]);
  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      if (cur.current) {
        setTip(null);
        setPos(null);
      }
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
        const b = el.getBoundingClientRect();
        setPos(null);
        setTip({
          el,
          text,
          r: { top: b.top, right: b.right, bottom: b.bottom, left: b.left, width: b.width, height: b.height },
          side: el.getAttribute('data-tip-side') === 'right' ? 'right' : 'auto',
        });
      }, 280);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  // Measure the rendered bubble, then place it; it stays invisible until placed.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    setPos(placeTip(tip.r, width, height, document.documentElement.clientWidth, window.innerHeight, tip.side));
  }, [tip]);
  if (!tip) return null;
  const style: CSSProperties = {
    position: 'fixed',
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    visibility: pos ? 'visible' : 'hidden',
    zIndex: 120,
    maxWidth: `min(260px, calc(100vw - ${EDGE * 2}px))`,
    padding: '6px 10px',
    borderRadius: 8,
    background: 'var(--tip-bg)',
    color: 'var(--tip-fg)',
    fontSize: 12.5,
    lineHeight: 1.4,
    boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
    animation: pos ? `aw-fade 140ms ${EASE}` : undefined,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    textAlign: tip.side === 'right' ? 'left' : 'center',
  };
  return (
    <div ref={box} role="tooltip" style={style}>
      {tip.text}
    </div>
  );
}
