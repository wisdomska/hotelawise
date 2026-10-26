'use client';
// The prototype's Select (design/Select.dc.html): a listbox that opens below or
// above the trigger, or as a bottom sheet on phones when there are more than five
// options. Full keyboard support; the panel is portalled so no ancestor clips it.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from './use-scroll-lock';

export type SelectOption = string | { value: string; label: string; sub?: string };
type Opt = { value: string; label: string; sub?: string };

export type SelectProps = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  variant?: 'field' | 'compact' | 'chip' | 'bare';
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  mono?: boolean;
  width?: number | string;
  panelWidth?: number;
  error?: boolean;
  dark?: boolean;
  name?: string;
  id?: string;
};

const EASE = 'cubic-bezier(0.23,1,0.32,1)';
const norm = (o: SelectOption): Opt => (typeof o === 'string' ? { value: o, label: o } : o);
type Pos = { top: number; left: number; width: number; maxH: number; above: boolean };

export function Select(p: SelectProps) {
  const opts = p.options.map(norm);
  const variant = p.variant ?? 'field';
  const trigRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const listId = useId();
  const cur = opts.find((o) => o.value === p.value);
  useScrollLock(open && sheet);

  const place = useCallback(() => {
    const t = trigRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const width = Math.max(r.width, p.panelWidth ?? 200);
    const natural = panelRef.current?.scrollHeight ?? Math.min(320, opts.length * 44 + 12);
    const h = Math.min(natural, 320, vh - 16);
    const below = vh - r.bottom - 16;
    const above = r.top - 16;
    if (r.bottom < 0 || r.top > vh) {
      setOpen(false);
      return;
    }
    const goAbove = h > below && (h <= above || above > below);
    const top = goAbove ? Math.max(8, r.top - 8 - h) : r.bottom + 8;
    setPos({ top, left: Math.max(8, Math.min(r.left, vw - width - 8)), width, maxH: Math.min(320, vh - 16), above: goAbove });
  }, [opts.length, p.panelWidth, setOpen, setPos]);

  const openIt = () => {
    setSheet(window.innerWidth < 640 && opts.length > 5);
    setActive(
      Math.max(
        0,
        opts.findIndex((o) => o.value === p.value),
      ),
    );
    setPos(null);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigRef.current?.focus();
  };
  const pick = (o: Opt) => {
    p.onChange(o.value);
    close(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const id = requestAnimationFrame(() => {
      if (!sheet) place();
    });
    return () => cancelAnimationFrame(id);
  }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!trigRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const reflow = (e: Event) => {
      if (sheet || (e.target instanceof Node && panelRef.current?.contains(e.target))) return;
      place();
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
    };
  }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelectorAll<HTMLElement>('[role=option]')[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const trig: React.CSSProperties = {
    field: {
      height: 48,
      padding: '0 14px',
      borderRadius: 10,
      border: `1.5px solid ${p.error ? '#B42318' : open ? '#000063' : 'rgba(0,0,99,0.2)'}`,
      background: '#F5F2EA',
      color: '#00003A',
      fontSize: 16,
    },
    compact: {
      height: 34,
      padding: '0 10px',
      borderRadius: 8,
      border: `1px solid ${open ? 'var(--ink, #000063)' : 'var(--line2, rgba(0,0,99,0.2))'}`,
      background: 'var(--bg, #F5F2EA)',
      color: 'var(--ink, #00003A)',
      fontSize: 12.5,
    },
    chip: { height: 32, padding: '0 10px', borderRadius: 8, border: 'none', background: '#F6E2B3', color: '#00003A', fontSize: 12 },
    bare: { minHeight: 28, padding: 0, border: 'none', background: 'transparent', color: 'inherit', fontSize: 18 },
  }[variant];
  const font = p.mono ? 'var(--font-mono)' : 'inherit';

  const panel: React.CSSProperties = sheet
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        maxHeight: '70%',
        overflowY: 'auto',
        background: '#F5F2EA',
        borderRadius: '18px 18px 0 0',
        padding: '14px 12px calc(22px + env(safe-area-inset-bottom))',
        overscrollBehavior: 'contain',
        boxShadow: '0 -20px 40px -20px rgba(20,16,10,0.45)',
        animation: `aw-sheet 360ms ${EASE}`,
      }
    : {
        position: 'fixed',
        zIndex: 200,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? 200,
        maxHeight: pos?.maxH ?? 320,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        visibility: pos ? 'visible' : 'hidden',
        background: p.dark ? 'rgba(14,14,62,0.96)' : 'rgba(255,255,255,0.94)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        border: p.dark ? '1px solid rgba(227,228,245,0.16)' : '1px solid rgba(0,0,99,0.1)',
        borderRadius: 12,
        padding: 6,
        boxShadow: '0 24px 50px -20px rgba(20,16,10,0.45)',
        color: p.dark ? '#ECEBF4' : '#00003A',
        animation: pos ? `aw-pop 180ms ${EASE}` : 'none',
        transformOrigin: pos?.above ? '50% 100%' : '50% 0',
      };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(opts.length - 1, a + (k === 'ArrowDown' ? 1 : -1))));
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      setActive(k === 'Home' ? 0 : opts.length - 1);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (opts[active]) pick(opts[active]);
    } else if (k === 'Tab') close(false);
    else if (k.length === 1) {
      const i = opts.findIndex((o) => o.label.toLowerCase().startsWith(k.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div style={{ position: 'relative', minWidth: 0, width: p.width ?? '100%' }}>
      {p.name && <input type="hidden" name={p.name} value={p.value} />}
      <button
        ref={trigRef}
        id={p.id}
        type="button"
        onClick={() => (open ? close(false) : openIt())}
        onKeyDown={(e) => {
          // Keys pressed before the panel takes focus still drive it.
          if (open) onKey(e);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openIt();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={p.ariaLabel ?? p.label ?? 'Choose'}
        style={{
          ...trig,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          textAlign: 'left',
          cursor: 'pointer',
          transition: `border-color 150ms ${EASE}`,
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
          {p.label && variant === 'bare' && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}
            >
              {p.label}
            </span>
          )}
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              fontFamily: font,
              opacity: cur ? 1 : 0.5,
            }}
          >
            {cur ? cur.label : (p.placeholder ?? 'Choose…')}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: 0.6, transition: `transform 200ms ${EASE}`, transform: `rotate(${open ? 180 : 0}deg)` }}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            {sheet && (
              <div
                onClick={() => close(true)}
                style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(20,16,10,0.4)', animation: `aw-fade 200ms ${EASE}` }}
              />
            )}
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-label={p.ariaLabel ?? p.label ?? 'Choose'}
              aria-activedescendant={`${listId}-${active}`}
              tabIndex={-1}
              onKeyDown={onKey}
              style={{ ...panel, outline: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {sheet && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '2px 0 8px' }}>
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,58,0.18)' }} />
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, letterSpacing: '-0.03em' }}>
                    {p.label ?? p.ariaLabel ?? 'Choose'}
                  </span>
                </div>
              )}
              {opts.map((o, i) => {
                const sel = o.value === p.value;
                return (
                  <div
                    key={o.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={sel}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      width: '100%',
                      minHeight: sheet ? 48 : 40,
                      padding: '0 12px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: sheet ? 16 : 14,
                      cursor: 'pointer',
                      flexShrink: 0,
                      background: i === active ? (p.dark ? 'rgba(227,228,245,0.1)' : 'rgba(242,181,68,0.28)') : 'transparent',
                      fontWeight: sel ? 500 : 400,
                      transition: `background 120ms ${EASE}`,
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                      <span
                        style={{ fontFamily: font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
                      >
                        {o.label}
                      </span>
                      {o.sub && <span style={{ fontSize: 11.5, opacity: 0.6 }}>{o.sub}</span>}
                    </span>
                    <span aria-hidden="true" style={{ fontSize: 12, opacity: sel ? 1 : 0 }}>
                      ✓
                    </span>
                  </div>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
