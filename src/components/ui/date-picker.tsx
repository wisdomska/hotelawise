'use client';
// Port of design/DatePicker.dc.html: a single-date picker with three trigger
// variants (bare, field, dark), a popover on wide screens and a bottom sheet
// under 640px, range highlighting, sold-out dates struck through, and full
// keyboard support (arrows move, Enter picks, Esc closes).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addDays, isIsoDate, todayInAccra, type IsoDate } from '@/lib/dates';
import { Icon, type AnyIconName } from './icon';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';
const PANEL_W = 312;
const EST_H = 380;

export type DatePickerProps = {
  value: IsoDate | '';
  onChange: (value: IsoDate) => void;
  label?: string;
  icon?: AnyIconName;
  variant?: 'bare' | 'field' | 'dark';
  min?: IsoDate;
  max?: IsoDate;
  disabledDates?: readonly IsoDate[];
  rangeStart?: IsoDate;
  rangeEnd?: IsoDate;
  placeholder?: string;
  withYear?: boolean;
  compact?: boolean;
  error?: boolean;
  bg?: string;
  hint?: string;
  id?: string;
};

type Pos = { top: number; left: number; maxH: number; side: 'below' | 'above'; ready: boolean };

const fmt = (k: IsoDate, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${k}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/** Containing block for position:fixed (transformed/filtered ancestors create one). */
function containingRect(el: HTMLElement | null): { left: number; top: number; width: number } {
  let anc = el?.parentElement ?? null;
  while (anc && anc !== document.body && anc !== document.documentElement) {
    const cs = getComputedStyle(anc);
    const bf = (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
    if (
      (cs.transform && cs.transform !== 'none') ||
      (cs.filter && cs.filter !== 'none') ||
      (cs.backdropFilter && cs.backdropFilter !== 'none') ||
      (bf && bf !== 'none') ||
      /paint|layout|strict|content/.test(cs.contain || '')
    ) {
      const r = anc.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    }
    anc = anc.parentElement;
  }
  return { left: 0, top: 0, width: window.innerWidth };
}

export function DatePicker(p: DatePickerProps) {
  const variant = p.variant ?? 'field';
  const rootRef = useRef<HTMLDivElement>(null);
  const trigRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [view, setView] = useState<IsoDate | null>(null);
  const [focus, setFocus] = useState<IsoDate | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [today, setToday] = useState<IsoDate>(() => todayInAccra());

  const v = p.value && isIsoDate(p.value) ? p.value : '';
  const blocked = useCallback(
    (k: IsoDate) => (!!p.min && k < p.min) || (!!p.max && k > p.max) || (p.disabledDates ?? []).includes(k),
    [p.min, p.max, p.disabledDates],
  );

  const place = useCallback((): Pos | null => {
    const t = trigRef.current;
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M = 8;
    const G = 8;
    const base = containingRect(t);
    const natural = panelRef.current ? Math.max(panelRef.current.scrollHeight, panelRef.current.offsetHeight) : EST_H;
    const H = Math.min(natural || EST_H, vh - 2 * M);
    const below = vh - r.bottom - G - M;
    const above = r.top - G - M;
    let side: Pos['side'];
    let top: number;
    if (H <= below) {
      side = 'below';
      top = r.bottom + G;
    } else if (H <= above) {
      side = 'above';
      top = r.top - G - H;
    } else {
      side = below >= above ? 'below' : 'above';
      top = side === 'below' ? r.bottom + G : r.top - G - H;
      top = Math.max(M, Math.min(top, vh - M - H));
    }
    const left = Math.max(M, Math.min(r.left, vw - PANEL_W - M));
    if (r.bottom < 0 || r.top > vh) return null;
    return { top: top - base.top, left: left - base.left, maxH: vh - 2 * M, side, ready: true };
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) trigRef.current?.focus();
  }, []);

  const openIt = () => {
    const t = trigRef.current;
    if (!t) return;
    const now = todayInAccra();
    setToday(now);
    const start = v || p.min || now;
    setSheet(containingRect(t).width < 640);
    setView(`${start.slice(0, 7)}-01`);
    setFocus(start);
    setPos(null);
    setOpen(true);
  };

  const pick = (k: IsoDate) => {
    if (blocked(k)) return;
    p.onChange(k);
    close(true);
  };

  // Place the popover once it has rendered (so its real height is known), and keep it attached on scroll/resize.
  // The panel stays invisible until positioned, so placing it in the next frame never shows a jump.
  useLayoutEffect(() => {
    if (!open || sheet) return;
    const raf = requestAnimationFrame(() => {
      const next = place();
      if (next) setPos(next);
      else setOpen(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, sheet, view, place]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    let raf = 0;
    const onMove = (e: Event) => {
      if (sheet) return;
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = place();
        if (next) setPos(next);
        else setOpen(false);
      });
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    // The bottom sheet locks page scroll while open.
    if (sheet) document.documentElement.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      if (sheet) document.documentElement.style.overflow = '';
    };
  }, [open, sheet, place, close]);

  const display = v
    ? fmt(v, { weekday: 'short', day: 'numeric', month: 'short', ...(p.withYear ? { year: 'numeric' } : {}) })
    : (p.placeholder ?? 'Pick a date');
  // Starts with the visible label and value, so voice control can say what it sees.
  const ariaLabel = `${p.label ?? 'Date'} ${display}`;
  const viewKey = view ?? `${(v || today).slice(0, 7)}-01`;
  const vd = new Date(`${viewKey}T00:00:00Z`);
  const y = vd.getUTCFullYear();
  const mo = vd.getUTCMonth();
  const lead = (vd.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const minView = p.min ? `${p.min.slice(0, 7)}-01` : null;
  const prevDisabled = !!(minView && viewKey <= minView);
  const shiftMonth = (n: number) => {
    const d = new Date(`${viewKey}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setView(d.toISOString().slice(0, 10));
  };
  const moveFocus = (n: number) => {
    const f = addDays(focus ?? (v || today), n);
    setFocus(f);
    setView(`${f.slice(0, 7)}-01`);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      moveFocus(-1);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      moveFocus(1);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-7);
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      moveFocus(7);
    } else if (k === 'Enter' && focus && e.target === panelRef.current) {
      e.preventDefault();
      pick(focus);
    }
  };

  const chevron = (
    <svg
      aria-hidden="true"
      data-mi-icon="down"
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
  );

  const triggerCommon = {
    ref: trigRef,
    type: 'button' as const,
    id: p.id,
    onClick: () => (open ? close() : openIt()),
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': open,
    // The bare trigger shows its label and date as text, which already names it.
    'aria-label': variant === 'bare' ? undefined : ariaLabel,
  };

  const fieldBorder = p.error
    ? p.compact
      ? 'var(--red, #B42318)'
      : '#B42318'
    : open
      ? p.compact
        ? 'var(--ink, #000063)'
        : '#000063'
      : p.compact
        ? 'var(--line2, rgba(0,0,99,0.2))'
        : 'rgba(0,0,99,0.2)';

  const panelStyle: React.CSSProperties = sheet
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        background: '#F5F2EA',
        borderRadius: '18px 18px 0 0',
        padding: '16px 18px calc(24px + env(safe-area-inset-bottom))',
        overscrollBehavior: 'contain',
        boxShadow: '0 -20px 40px -20px rgba(20,16,10,0.45)',
        animation: `awdp-sheet 360ms ${EASE}`,
        outline: 'none',
        fontFamily: 'var(--font-sans)',
        color: '#00003A',
      }
    : {
        position: 'fixed',
        zIndex: 200,
        width: PANEL_W,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        maxHeight: pos?.maxH ?? 'calc(100vh - 16px)',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        visibility: pos?.ready ? 'visible' : 'hidden',
        background: 'rgba(255,255,255,0.92)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        border: '1px solid rgba(0,0,99,0.1)',
        borderRadius: 16,
        padding: 14,
        boxShadow: '0 24px 60px -24px rgba(20,16,10,0.45)',
        outline: 'none',
        fontFamily: 'var(--font-sans)',
        color: '#00003A',
        animation: pos?.ready ? `awdp-pop 220ms ${EASE}` : 'none',
        transformOrigin: pos?.side === 'above' ? '0 100%' : '0 0',
      };

  const days: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) days.push(<span key={`lead-${i}`} aria-hidden="true" style={{ visibility: 'hidden', height: 40 }} />);
  for (let d = 1; d <= dim; d++) {
    const k = new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
    const sel = k === v;
    const edge = k === p.rangeStart || k === p.rangeEnd;
    const inRange = !!(p.rangeStart && p.rangeEnd && k > p.rangeStart && k < p.rangeEnd);
    const dis = blocked(k);
    const sold = (p.disabledDates ?? []).includes(k);
    const foc = k === focus;
    days.push(
      <button
        key={k}
        type="button"
        onClick={() => pick(k)}
        disabled={dis}
        aria-pressed={sel}
        aria-label={fmt(k, { weekday: 'long', day: 'numeric', month: 'long' }) + (sold ? ', fully booked' : '')}
        className={dis || sel ? undefined : 'aw-day'}
        style={{
          height: sheet ? 46 : 40,
          border: 'none',
          borderRadius: sel ? 999 : inRange ? 0 : 999,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          cursor: dis ? 'not-allowed' : 'pointer',
          background: sel ? '#000063' : edge ? 'rgba(0,0,99,0.12)' : inRange ? '#F6E2B3' : 'transparent',
          color: sel ? '#F5F2EA' : dis ? 'rgba(0,0,58,0.28)' : '#00003A',
          textDecoration: sold ? 'line-through' : 'none',
          boxShadow: foc && !sel ? 'inset 0 0 0 1.5px #000063' : k === today && !sel ? 'inset 0 0 0 1.5px #F2B544' : 'none',
          transition: `background 150ms ${EASE}, transform 120ms ${EASE}`,
        }}
      >
        {d}
      </button>,
    );
  }

  const monthBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    width: 'max(36px, var(--tap-min, 0px))',
    height: 'max(36px, var(--tap-min, 0px))',
    borderRadius: 999,
    border: '1px solid rgba(0,0,99,0.14)',
    background: '#FFFFFF',
    color: '#00003A',
    fontSize: 15,
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      {variant === 'bare' && (
        <button
          {...triggerCommon}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: 0,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              opacity: 0.65,
            }}
          >
            {p.icon && <Icon name={p.icon} size={14} />}
            {p.label}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 28 }}>
            <span style={{ fontSize: 18, whiteSpace: 'nowrap' }}>{display}</span>
            {chevron}
          </span>
        </button>
      )}
      {variant === 'field' && (
        <button
          {...triggerCommon}
          style={{
            width: '100%',
            height: p.compact ? 40 : 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: p.compact ? '0 10px' : '0 14px',
            borderRadius: p.compact ? 8 : 10,
            border: `${p.compact ? 1 : 1.5}px solid ${fieldBorder}`,
            background: p.bg ?? (p.compact ? 'var(--bg, #F5F2EA)' : '#F5F2EA'),
            color: p.compact ? 'var(--ink, #00003A)' : '#00003A',
            fontSize: p.compact ? 13.5 : 16,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: v ? 1 : 0.5 }}>{display}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, opacity: 0.6 }}
          >
            <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
            <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
          </svg>
        </button>
      )}
      {variant === 'dark' && (
        <button
          {...triggerCommon}
          style={{
            width: '100%',
            height: 46,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid rgba(245,242,234,0.28)',
            background: 'rgba(245,242,234,0.06)',
            color: '#F5F2EA',
            fontSize: 15,
            textAlign: 'left',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
          {chevron}
        </button>
      )}

      {open && (
        <>
          {sheet && (
            <div
              onClick={() => close(true)}
              style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(20,16,10,0.4)', animation: `awdp-fade 200ms ${EASE}` }}
            />
          )}
          <div ref={panelRef} role="dialog" aria-label="Choose a date" tabIndex={-1} onKeyDown={onKey} style={panelStyle}>
            {sheet && <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,58,0.18)', margin: '-4px auto 10px' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.03em' }}>
                {fmt(viewKey, { month: 'long', year: 'numeric' })}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  disabled={prevDisabled}
                  aria-label="Previous month"
                  className="aw-press"
                  style={{ ...monthBtn, opacity: prevDisabled ? 0.35 : 1 }}
                >
                  ‹
                </button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="aw-press" style={monthBtn}>
                  ›
                </button>
              </div>
            </div>
            <div role="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', rowGap: 2 }}>
              {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((w) => (
                <span
                  key={w}
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: 'rgba(0,0,58,0.45)',
                    padding: '4px 0 6px',
                  }}
                >
                  {w}
                </span>
              ))}
              {days}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid rgba(0,0,99,0.08)',
              }}
            >
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={blocked(today)}
                style={{
                  height: 'max(32px, var(--tap-min, 0px))',
                  padding: '0 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#F6E2B3',
                  color: '#00003A',
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                Today
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(0,0,58,0.5)' }}>
                {p.hint ?? '← → ↑ ↓ · ENTER · ESC'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
