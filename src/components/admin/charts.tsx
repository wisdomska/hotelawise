'use client';
// Charts from Admin.dc.html: sparkline, stacked bars, smoothed line with a
// reference line, donut split and ranked bars, with the same hover tooltips.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EASE, mono, panel } from './ui';

export function ChartGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-charts)', gap: 12, gridAutoFlow: 'dense', alignItems: 'stretch' }}>
      {children}
    </div>
  );
}

const niceStep = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
};

export function Spark({ values, color = 'var(--chart)' }: { values: number[]; color?: string }) {
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const Y = (v: number) => 26 - ((v - min) / (max - min || 1)) * 22;
  const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (n - 1)) * 100).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: '100%', height: 28, display: 'block', overflow: 'visible' }}
    >
      <path d={d + ' L100 28 L0 28 Z'} fill="var(--chart-fill)" stroke="none" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Head({
  title,
  big,
  bigNote,
  legend,
  square,
}: {
  title: string;
  big: string;
  bigNote: string;
  legend: { label: string; color: string }[];
  square: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--mute)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{big}</span>
          <span style={{ fontSize: 12.5, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{bigNote}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {legend.map((lg) => (
          <span key={lg.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mute)' }}>
            <span style={{ width: square ? 10 : 12, height: square ? 10 : 3, borderRadius: square ? 3 : 2, background: lg.color }} />
            {lg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TipBox({
  x,
  shift,
  title,
  lines,
  dot,
}: {
  x: string;
  shift: string;
  title: string;
  lines: { label: string; value: string; color: string }[];
  dot: 'sq' | 'round';
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Flipping at the midpoint isn't enough on a narrow chart: measure the card and
  // nudge it back inside its chart panel and the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translateX(${shift})`;
    const r = el.getBoundingClientRect();
    const panel = el.closest('section')?.getBoundingClientRect();
    const lo = Math.max(panel ? panel.left + 4 : 0, 8);
    const hi = Math.min(panel ? panel.right - 4 : Infinity, document.documentElement.clientWidth - 8);
    const dx = r.left < lo ? lo - r.left : r.right > hi ? Math.max(lo - r.left, hi - r.right) : 0;
    if (dx) el.style.transform = `translateX(calc(${shift} + ${Math.round(dx)}px))`;
  }, [x, shift, title]);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 4,
        left: x,
        transform: `translateX(${shift})`,
        maxWidth: 'calc(100vw - 16px)',
        minWidth: 150,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--tip-bg)',
        color: 'var(--tip-fg)',
        boxShadow: '0 12px 28px -12px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <span style={{ fontSize: 11.5, opacity: 0.75 }}>{title}</span>
      {lines.map((tl) => (
        <span key={tl.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: dot === 'sq' ? 2 : '50%', background: tl.color }} />
            {tl.label}
          </span>
          <span style={{ fontFamily: mono, fontWeight: 500 }}>{tl.value}</span>
        </span>
      ))}
    </div>
  );
}

type BarProps = {
  title: string;
  big: string;
  bigNote: string;
  labels: string[];
  short: string[];
  a: number[];
  b?: number[];
  nameA: string;
  nameB?: string;
  colorA: string;
  colorB?: string;
  fmt: (v: number) => string;
  span?: string;
};

export function BarChart(o: BarProps) {
  const [hv, setHv] = useState<number | null>(null);
  const n = o.labels.length;
  const H = 200;
  const tot = o.a.map((v, i) => v + (o.b ? o.b[i]! : 0));
  const top = Math.max(...tot, 1);
  const stepV = niceStep(top / 4);
  const max = stepV * Math.ceil(top / stepV);
  const grid: { top: string; label: string }[] = [];
  for (let v = stepV; v <= max + 0.001; v += stepV) grid.push({ top: H - (v / max) * H + 'px', label: o.fmt(v) });
  const on = hv != null;
  const gap = n > 20 ? '3px' : '8px';
  return (
    <section
      style={{ ...panel, gridColumn: o.span ?? '1 / -1', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}
    >
      <Head
        title={o.title}
        big={o.big}
        bigNote={o.bigNote}
        square
        legend={[{ label: o.nameA, color: o.colorA }, ...(o.b && o.nameB ? [{ label: o.nameB, color: o.colorB ?? 'transparent' }] : [])]}
      />
      <div
        onMouseLeave={() => setHv(null)}
        role="img"
        aria-label={`${o.title}: ${o.big}`}
        style={{ position: 'relative', height: H, marginLeft: 48 }}
      >
        {grid.map((g) => (
          <span key={g.top}>
            <span
              style={{ position: 'absolute', left: 0, right: 0, top: g.top, borderTop: '1px dashed var(--line)', pointerEvents: 'none' }}
            />
            <span
              style={{
                position: 'absolute',
                left: -48,
                width: 40,
                textAlign: 'right',
                top: g.top,
                transform: 'translateY(-50%)',
                fontFamily: mono,
                fontSize: 10.5,
                color: 'var(--mute)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {g.label}
            </span>
          </span>
        ))}
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: '1px solid var(--line2)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'stretch', gap }}>
          {o.a.map((v, i) => {
            const h1 = (v / max) * H;
            const h2 = o.b ? (o.b[i]! / max) * H : 0;
            return (
              <div
                key={i}
                onMouseEnter={() => setHv(i)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  borderRadius: 6,
                  background: hv === i ? 'var(--hover)' : 'transparent',
                  transition: 'background 150ms',
                }}
              >
                <div
                  style={{
                    width: '68%',
                    maxWidth: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    opacity: on && hv !== i ? 0.45 : 1,
                    transition: 'opacity 150ms',
                  }}
                >
                  {h2 > 0 && (
                    <div
                      style={{
                        height: h2,
                        background: o.colorB,
                        borderRadius: '4px 4px 0 0',
                        transformOrigin: 'bottom',
                        animation: `aw-grow 600ms ${EASE} both`,
                      }}
                    />
                  )}
                  <div
                    style={{
                      height: h1,
                      background: o.colorA,
                      borderRadius: h2 > 0 ? 0 : '4px 4px 0 0',
                      transformOrigin: 'bottom',
                      animation: `aw-grow 600ms ${EASE} both`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {on && (
          <TipBox
            x={((hv + 0.5) / n) * 100 + '%'}
            shift={hv > n / 2 ? 'calc(-100% - 14px)' : '14px'}
            title={o.labels[hv]!}
            dot="sq"
            lines={[
              { label: o.nameA, value: o.fmt(o.a[hv]!), color: o.colorA },
              ...(o.b && o.nameB
                ? [
                    { label: o.nameB, value: o.fmt(o.b[hv]!), color: o.colorB ?? 'transparent' },
                    { label: 'Total', value: o.fmt(tot[hv]!), color: 'transparent' },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap, paddingLeft: 48, fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>
        {o.short.map((l, i) => (
          <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {n <= 14 || i % 3 === 0 ? l : ''}
          </span>
        ))}
      </div>
    </section>
  );
}

type LineSeries = { name: string; values: number[]; color: string; fill?: boolean };
type LineProps = {
  title: string;
  big: string;
  bigNote: string;
  labels: string[];
  short: string[];
  series: LineSeries[];
  fmt: (v: number) => string;
  pct?: boolean;
  refLine?: number;
  refLabel?: string;
  span?: string;
};

export function LineChart(o: LineProps) {
  const gid = useId().replace(/:/g, '');
  const [hv, setHv] = useState<number | null>(null);
  const W = 600;
  const H = 200;
  const PT = 10;
  const PB = 2;
  const n = o.labels.length;
  const vals = o.series.flatMap((s) => s.values);
  const top = Math.max(...vals, o.refLine ?? 0, 1);
  const stepV = o.pct ? 25 : niceStep(top / 4);
  const max = o.pct ? 100 : stepV * Math.ceil(top / stepV);
  const X = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const Y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const smooth = (pts: [number, number][]) => {
    let d = 'M' + pts[0]![0].toFixed(1) + ' ' + pts[0]![1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const t = 0.16;
      const lo = Math.min(p1[1], p2[1]);
      const hi = Math.max(p1[1], p2[1]);
      const cl = (v: number) => Math.max(lo, Math.min(hi, v));
      d +=
        ' C' +
        (p1[0] + (p2[0] - p0[0]) * t).toFixed(1) +
        ' ' +
        cl(p1[1] + (p2[1] - p0[1]) * t).toFixed(1) +
        ' ' +
        (p2[0] - (p3[0] - p1[0]) * t).toFixed(1) +
        ' ' +
        cl(p2[1] - (p3[1] - p1[1]) * t).toFixed(1) +
        ' ' +
        p2[0].toFixed(1) +
        ' ' +
        p2[1].toFixed(1);
    }
    return d;
  };
  const paths = n ? o.series.map((s) => smooth(s.values.map((v, i) => [X(i), Y(v)]))) : [];
  const grid: { y: number; label: string }[] = [];
  for (let v = stepV; v <= max + 0.001; v += stepV) grid.push({ y: Y(v), label: o.fmt(v) });
  const on = hv != null;
  const pct = (i: number) => (X(i) / W) * 100 + '%';
  const step = Math.max(1, Math.round(n / 5));
  const xlabels = o.short.filter((_, i) => i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2));
  return (
    <section
      style={{ ...panel, gridColumn: o.span ?? '1 / -1', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}
    >
      <Head
        title={o.title}
        big={o.big}
        bigNote={o.bigNote}
        square={false}
        legend={o.series.length > 1 ? o.series.map((s) => ({ label: s.name, color: s.color })) : []}
      />
      <div
        onMouseLeave={() => setHv(null)}
        role="img"
        aria-label={`${o.title}: ${o.big}`}
        style={{ position: 'relative', height: H, marginLeft: 48 }}
      >
        <svg
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={gid} x1={0} y1={0} x2={0} y2={1}>
              <stop offset="0%" style={{ stopColor: o.series[0]?.color, stopOpacity: 0.24 }} />
              <stop offset="100%" style={{ stopColor: o.series[0]?.color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path
            d={grid.map((g) => 'M0 ' + g.y.toFixed(1) + ' H' + W).join(' ')}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <path d={'M0 ' + H + ' H' + W} fill="none" stroke="var(--line2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {o.refLine != null && (
            <path
              d={'M0 ' + Y(o.refLine).toFixed(1) + ' H' + W}
              fill="none"
              stroke="var(--mute)"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {paths[0] && o.series[0]!.fill && <path d={paths[0] + ` L${W} ${H} L0 ${H} Z`} fill={`url(#${gid})`} stroke="none" />}
          {paths[1] && (
            <path
              d={paths[1]}
              fill="none"
              stroke={o.series[1]!.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {paths[0] && (
            <path
              d={paths[0]}
              fill="none"
              stroke={o.series[0]!.color}
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {grid.map((g) => (
          <span
            key={g.label}
            style={{
              position: 'absolute',
              left: -48,
              width: 40,
              textAlign: 'right',
              top: g.y,
              transform: 'translateY(-50%)',
              fontFamily: mono,
              fontSize: 10.5,
              color: 'var(--mute)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {g.label}
          </span>
        ))}
        {o.refLine != null && o.refLabel && (
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: Y(o.refLine),
              transform: 'translateY(-110%)',
              whiteSpace: 'nowrap',
              padding: '0 0 0 4px',
              background: 'var(--panel)',
              fontFamily: mono,
              fontSize: 10.5,
              color: 'var(--mute)',
              pointerEvents: 'none',
            }}
          >
            {o.refLabel}
          </span>
        )}
        {(on ? [] : o.series).map((s) => (n ? <Dot key={s.name} left={pct(n - 1)} top={Y(s.values[n - 1]!)} color={s.color} /> : null))}
        {on && (
          <>
            <span
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: pct(hv),
                width: 1,
                background: 'var(--line2)',
                pointerEvents: 'none',
              }}
            />
            {o.series.map((s) => (
              <Dot key={s.name} left={pct(hv)} top={Y(s.values[hv]!)} color={s.color} />
            ))}
            <TipBox
              x={pct(hv)}
              shift={hv > n / 2 ? 'calc(-100% - 12px)' : '12px'}
              title={o.labels[hv]!}
              dot="round"
              lines={o.series.map((s) => ({ label: s.name, value: o.fmt(s.values[hv]!), color: s.color }))}
            />
          </>
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {o.labels.map((_, i) => (
            <div key={i} onMouseEnter={() => setHv(i)} style={{ flex: 1, height: '100%' }} />
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          paddingLeft: 48,
          fontFamily: mono,
          fontSize: 11,
          color: 'var(--mute)',
        }}
      >
        {xlabels.map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
    </section>
  );
}

function Dot({ left, top, color }: { left: string; top: number; color: string }) {
  return (
    <span
      style={{
        position: 'absolute',
        left,
        top,
        width: 9,
        height: 9,
        margin: '-4.5px 0 0 -4.5px',
        borderRadius: '50%',
        background: color,
        boxShadow: '0 0 0 3px var(--panel)',
        pointerEvents: 'none',
      }}
    />
  );
}

export function SplitChart({
  title,
  parts,
  fmt,
  note,
}: {
  title: string;
  parts: [string, number, string][];
  fmt: (v: number) => string;
  note?: string;
}) {
  const tot = parts.reduce((t, p) => t + p[1], 0) || 1;
  const C = 2 * Math.PI * 52;
  const lead = [...parts].sort((x, y) => y[1] - x[1])[0];
  return (
    <section style={{ ...panel, gridColumn: 'var(--sp2)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--mute)' }}>{title}</span>
        <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {fmt(parts.reduce((t, p) => t + p[1], 0))}
        </span>
        {note && <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{note}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
        <div
          role="img"
          aria-label={parts.map((p) => `${p[0]} ${Math.round((p[1] / tot) * 100)}%`).join(', ')}
          style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}
        >
          <svg viewBox="0 0 148 148" width={148} height={148} aria-hidden="true" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle cx={74} cy={74} r={52} fill="none" stroke="var(--line)" strokeWidth={16} />
            {parts.map(([label, v, color], i) => {
              const len = Math.max(0, (v / tot) * C - (parts.length > 1 ? 3 : 0));
              const off = parts.slice(0, i).reduce((t, q) => t + (q[1] / tot) * C, 0);
              return (
                <circle
                  key={label}
                  cx={74}
                  cy={74}
                  r={52}
                  fill="none"
                  stroke={color}
                  strokeWidth={16}
                  strokeDasharray={`${len} ${C}`}
                  strokeDashoffset={-off}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 500 }}>{lead ? Math.round((lead[1] / tot) * 100) : 0}%</span>
            <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{lead?.[0].toLowerCase()}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 160, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {parts.map(([label, v, color]) => (
            <div
              key={label}
              style={{
                display: 'grid',
                gridTemplateColumns: '10px minmax(0,1fr) auto',
                gap: '2px 10px',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                {Math.round((v / tot) * 100)}%
              </span>
              <span />
              <span style={{ gridColumn: '2 / -1', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Ranked bars; the leader is lamp-amber. `asShare` shows the value as the bar width (0–100). */
export function RankChart({
  title,
  note,
  rows,
  fmt,
  asShare,
}: {
  title: string;
  note: string;
  rows: [string, number][];
  fmt: (v: number) => string;
  asShare?: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  const tot = sorted.reduce((t, r) => t + r[1], 0) || 1;
  return (
    <section style={{ ...panel, gridColumn: 'var(--sp2)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>{note}</span>
      </div>
      {sorted.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--mute)' }}>Nothing to show yet.</span>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sorted.map(([label, v], i) => (
            <li
              key={label}
              style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: '6px 10px', alignItems: 'baseline' }}
            >
              <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              <span style={{ fontFamily: mono, fontSize: 13, whiteSpace: 'nowrap' }}>
                {fmt(v)}
                {!asShare && <span style={{ marginLeft: 8, color: 'var(--mute)', fontSize: 11.5 }}>{Math.round((v / tot) * 100)}%</span>}
              </span>
              <div style={{ gridColumn: '2 / -1', height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${asShare ? Math.max(2, v) : Math.max(2, (v / max) * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: i === 0 ? '#F2B544' : 'var(--chart)',
                    transition: `width 600ms ${EASE}`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
