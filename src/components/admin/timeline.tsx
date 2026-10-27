'use client';
// Two-week timeline from Admin.dc.html (bookings by room, rental orders, the
// venue calendar). Bars can be dragged to move them, or stretched by their
// right edge, when the screen passes onDrop.
import { useRef, useState } from 'react';
import { addDays, nightsBetween, type IsoDate } from '@/lib/dates';
import { Select } from '@/components/ui/select';
import { mono, panel, type Tone } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const label = (d: IsoDate, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

export type TlBar = {
  key: string;
  label: string;
  title: string;
  from: IsoDate;
  /** Exclusive end (check-out day, or the day after a return). */
  to: IsoDate;
  tone: Tone | 'green';
  onOpen: () => void;
  /** Moving or stretching; return false (or a message) to snap back. */
  onDrop?: (mode: 'move' | 'extend', delta: number) => void;
};
export type TlRow = { key: string; label: string; sub: string; bars: TlBar[] };

type Props = {
  title: string;
  hint: string;
  rowHead: string;
  firstCol: number;
  start: IsoDate;
  today: IsoDate;
  rows: TlRow[];
  onShift: (days: number | 'today') => void;
  emptyText?: string;
};

const TONE: Record<string, [string, string]> = {
  solid: ['var(--pri-bg)', 'var(--pri-fg)'],
  mid: ['var(--chip-bg)', 'var(--chip-fg)'],
  amber: ['rgba(242,181,68,0.85)', '#00003A'],
  grey: ['var(--line2)', 'var(--ink)'],
  red: ['var(--red-bg)', 'var(--red)'],
  green: ['var(--green)', 'var(--on-green)'],
};

const DAYS = 14;

export function Timeline(p: Props) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(p.start, i));
  const cols = `${p.firstCol}px repeat(${DAYS}, minmax(52px,1fr))`;
  const [drag, setDrag] = useState<{ key: string; mode: 'move' | 'extend'; delta: number } | null>(null);
  const dragged = useRef(false);

  const startDrag = (e: React.PointerEvent, bar: TlBar, mode: 'move' | 'extend') => {
    if (!bar.onDrop) return;
    const row = (e.currentTarget as HTMLElement).closest('[data-tl-row]') as HTMLElement | null;
    if (!row) return;
    const w = (row.getBoundingClientRect().width - p.firstCol) / DAYS;
    const x0 = e.clientX;
    dragged.current = false;
    let delta = 0;
    const move = (ev: PointerEvent) => {
      const d = Math.round((ev.clientX - x0) / w);
      if (d !== 0) dragged.current = true;
      if (d !== delta) {
        delta = d;
        setDrag({ key: bar.key, mode, delta: d });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (delta) bar.onDrop?.(mode, delta);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const shiftBtn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: '1px solid var(--line2)',
    background: 'transparent',
  };
  // Jumping to a month or a year: the view starts on that month's 1st.
  const [y, m] = p.start.split('-').map(Number) as [number, number];
  const thisYear = Number(p.today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 2 + i);
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);
  const jump = (year: number, month: number) => {
    const first = `${year}-${String(month).padStart(2, '0')}-01` as IsoDate;
    p.onShift(nightsBetween(p.start, first));
  };
  const end = addDays(p.start, DAYS - 1);
  const range =
    p.start.slice(0, 4) === end.slice(0, 4)
      ? `${label(p.start, { day: 'numeric', month: 'short' })} – ${label(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${label(p.start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${label(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return (
    <section style={{ ...panel, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{p.title}</h2>
          <span aria-live="polite" style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--mute)' }}>
            {range}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>{p.hint}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Select
              variant="compact"
              ariaLabel="Month"
              value={String(m)}
              options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
              onChange={(v) => jump(y, Number(v))}
              width={130}
            />
            <Select
              variant="compact"
              ariaLabel="Year"
              value={String(y)}
              options={years.map((yr) => ({ value: String(yr), label: String(yr) }))}
              onChange={(v) => jump(Number(v), m)}
              width={92}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => p.onShift(-14)}
              aria-label="Earlier two weeks"
              data-tip="Earlier two weeks"
              style={shiftBtn}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => p.onShift('today')}
              style={{
                height: 40,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid var(--line2)',
                background: 'transparent',
                fontSize: 13,
              }}
            >
              Today
            </button>
            <button type="button" onClick={() => p.onShift(14)} aria-label="Later two weeks" data-tip="Later two weeks" style={shiftBtn}>
              →
            </button>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <div style={{ minWidth: 960 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line)' }}>
            <span style={{ padding: '8px 12px', fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>{p.rowHead}</span>
            {days.map((d, i) => {
              const dt = new Date(d + 'T00:00:00Z');
              const isToday = d === p.today;
              return (
                <span
                  key={d}
                  style={{
                    padding: '8px 4px',
                    textAlign: 'center',
                    fontFamily: mono,
                    fontSize: 11,
                    color: isToday ? 'var(--ink)' : 'var(--mute)',
                    background: isToday ? 'rgba(242,181,68,0.18)' : 'transparent',
                    lineHeight: 1.3,
                  }}
                >
                  {i === 0 || dt.getUTCDate() === 1 ? (
                    <span style={{ display: 'block', color: 'var(--ink)', fontWeight: 600 }}>
                      {dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}
                    </span>
                  ) : (
                    <span aria-hidden="true" style={{ display: 'block' }}>
                      &nbsp;
                    </span>
                  )}
                  {dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2).toUpperCase()}
                  <br />
                  {dt.getUTCDate()}
                </span>
              );
            })}
          </div>
          {p.rows.map((row) => (
            <div
              key={row.key}
              data-tl-row=""
              style={{
                display: 'grid',
                gridTemplateColumns: cols,
                gridTemplateRows: '42px',
                borderBottom: '1px solid var(--line)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  gridColumn: 1,
                  gridRow: 1,
                  padding: '0 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  fontSize: 12.5,
                  minWidth: 0,
                }}
              >
                <span style={{ fontFamily: mono, fontWeight: 500 }}>{row.label}</span>
                <span style={{ fontSize: 11, color: 'var(--mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.sub}
                </span>
              </span>
              {days.map((d, i) => (
                <span
                  key={d}
                  style={{
                    gridColumn: i + 2,
                    gridRow: 1,
                    borderLeft: '1px solid var(--line)',
                    background: d === p.today ? 'rgba(242,181,68,0.08)' : 'transparent',
                  }}
                />
              ))}
              {row.bars.map((b) => {
                const dr = drag?.key === b.key ? drag : null;
                const start = nightsBetween(p.start, b.from) + (dr?.mode === 'move' ? dr.delta : 0);
                const n = Math.max(1, nightsBetween(b.from, b.to) + (dr?.mode === 'extend' ? dr.delta : 0));
                if (start + n <= 0 || start > DAYS - 1) return null;
                const colStart = Math.max(0, start) + 2;
                const span = Math.min(DAYS, start + n) - Math.max(0, start);
                const [bg, fg] = TONE[b.tone] ?? TONE.mid!;
                return (
                  <div
                    key={b.key}
                    role="button"
                    tabIndex={0}
                    // The visible label comes first, so voice users can say what they see (WCAG 2.5.3).
                    aria-label={b.title.startsWith(b.label) ? b.title : `${b.label}, ${b.title}`}
                    title={b.title}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        b.onOpen();
                      }
                    }}
                    onPointerDown={(e) => startDrag(e, b, 'move')}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      b.onOpen();
                    }}
                    style={{
                      gridColumn: `${colStart} / span ${span}`,
                      gridRow: 1,
                      margin: '6px 3px',
                      borderRadius: 7,
                      // Tints are laid over the panel colour so each bar is opaque: two stays that
                      // share a night (an early check-out, then the room resold) stay readable.
                      background: `linear-gradient(${bg}, ${bg}), var(--panel)`,
                      color: fg,
                      fontSize: 11.5,
                      padding: '0 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 4,
                      cursor: b.onDrop ? 'grab' : 'pointer',
                      zIndex: dr ? 3 : 1,
                      position: 'relative',
                      touchAction: 'none',
                      userSelect: 'none',
                      minWidth: 0,
                      boxShadow: dr ? '0 8px 20px -8px rgba(0,0,0,0.5)' : undefined,
                      transform: dr ? 'scale(1.02)' : undefined,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                    {b.onDrop && (
                      <span
                        aria-hidden="true"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startDrag(e, b, 'extend');
                        }}
                        style={{
                          width: 8,
                          alignSelf: 'stretch',
                          cursor: 'ew-resize',
                          borderRight: '2px solid currentColor',
                          opacity: 0.5,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {p.rows.length === 0 && (
        <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13.5, color: 'var(--mute)' }}>
          {p.emptyText ?? 'Nothing in these two weeks. Use the arrows to look further.'}
        </div>
      )}
    </section>
  );
}
