'use client';
// The admin table card from Admin.dc.html: title and count, filter chips,
// mono/number/chip/photo cells, row actions, empty state and an 8-row pager.
// Long lists page on the server (`pager.href`); short ones page in the browser.
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { btnColors, chip, mono, panel, statusTone, type Action, type Tone } from './ui';

export const PAGE = 8;

export type CellKind = 'mono' | 'num' | 'money' | 'mute' | 'wrap' | 'chip';
export type Cell = {
  t: string;
  kind?: CellKind;
  tone?: Tone;
  sub?: string;
  img?: { src: string | null; alt: string; onClick?: () => void };
  style?: CSSProperties;
};

export const c = (t: string | number | null | undefined, kind?: CellKind, sub?: string, tone?: Tone): Cell => ({
  t: t == null ? '' : String(t),
  kind,
  sub,
  tone,
});

export type Row = { key: string; on?: () => void; cells: Cell[]; actions?: Action[] };
export type Col = { label: string; align?: 'left' | 'right' };
export const col = (label: string, align?: 'left' | 'right'): Col => ({ label, align });

export type FilterChip = { label: string; pressed: boolean; on?: () => void; href?: string };

type Pager = { page: number; total: number; href: (page: number) => string };

type Props = {
  title: string;
  count?: string;
  chips?: FilterChip[];
  cols: Col[];
  rows: Row[];
  minW?: number;
  empty?: { icon: AnyIconName; text: string; sub?: string };
  /** Server-side paging. Without it, more than 8 rows page in the browser. */
  pager?: Pager;
  headerExtra?: ReactNode;
};

export function DataTable(p: Props) {
  const hasActions = p.rows.some((r) => r.actions?.length);
  const [local, setLocal] = useState(0);
  const total = p.pager ? p.pager.total : p.rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cur = p.pager ? Math.min(p.pager.page, pages - 1) : Math.min(local, pages - 1);
  const rows = p.pager ? p.rows : p.rows.slice(cur * PAGE, cur * PAGE + PAGE);
  return (
    <section style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{p.title}</h2>
          {p.count != null && (
            <span style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--mute)', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.count}</span>
          )}
          {p.headerExtra}
        </div>
        {!!p.chips?.length && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {p.chips.map((ch) => {
              const st: CSSProperties = {
                height: 32,
                padding: '0 12px',
                whiteSpace: 'nowrap',
                borderRadius: 999,
                border: `1px solid ${ch.pressed ? 'var(--pri-bg)' : 'var(--line2)'}`,
                background: ch.pressed ? 'var(--pri-bg)' : 'transparent',
                color: ch.pressed ? 'var(--pri-fg)' : 'var(--ink)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              };
              return ch.href ? (
                <Link key={ch.label} href={ch.href} scroll={false} aria-current={ch.pressed ? 'true' : undefined} style={st}>
                  {ch.label}
                </Link>
              ) : (
                <button key={ch.label} type="button" onClick={ch.on} aria-pressed={ch.pressed} style={st}>
                  {ch.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {rows.length > 0 ? (
        <div style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ width: '100%', minWidth: p.minW ?? 720, fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {p.cols.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    style={{
                      textAlign: h.align ?? 'left',
                      padding: '9px 12px',
                      fontWeight: 400,
                      fontSize: 11.5,
                      color: 'var(--mute)',
                      whiteSpace: 'nowrap',
                      fontFamily: mono,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {h.label}
                  </th>
                ))}
                {hasActions && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  className="aw-row"
                  onClick={r.on}
                  style={{ borderTop: '1px solid var(--line)', cursor: r.on ? 'pointer' : 'default', transition: 'background 120ms' }}
                >
                  {r.cells.map((cl, i) => (
                    <CellTd key={i} cl={cl} first={i === 0} onOpen={r.on} />
                  ))}
                  {hasActions && (
                    <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        {(r.actions ?? []).map((a) => (
                          <ActionButton key={a.label} a={a} />
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '36px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--chip-bg)',
              color: 'var(--chip-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={p.empty?.icon ?? 'info'} size={18} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{p.empty?.text ?? 'Nothing here yet'}</span>
          {p.empty?.sub && <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{p.empty.sub}</span>}
        </div>
      )}
      {total > PAGE && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '10px 16px',
            borderTop: '1px solid var(--line)',
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
            Showing {cur * PAGE + 1}–{Math.min(total, cur * PAGE + PAGE)} of {total}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PagerBtn label="Previous" disabled={cur === 0} href={p.pager?.href(cur - 1)} on={() => setLocal(cur - 1)} />
            <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--mute)', minWidth: 52, textAlign: 'center' }}>
              {cur + 1} / {pages}
            </span>
            <PagerBtn label="Next" disabled={cur >= pages - 1} href={p.pager?.href(cur + 1)} on={() => setLocal(cur + 1)} />
          </div>
        </div>
      )}
    </section>
  );
}

function PagerBtn({ label, disabled, href, on }: { label: string; disabled: boolean; href?: string; on: () => void }) {
  const st: CSSProperties = {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--line2)',
    background: 'transparent',
    fontSize: 12.5,
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--ink)',
    textDecoration: 'none',
  };
  if (href && !disabled)
    return (
      <Link href={href} scroll={false} style={st}>
        {label}
      </Link>
    );
  return (
    <button type="button" disabled={disabled} onClick={on} style={st}>
      {label}
    </button>
  );
}

function CellTd({ cl, onOpen, first }: { cl: Cell; onOpen?: () => void; first: boolean }) {
  const k = cl.kind;
  const isMono = k === 'mono' || k === 'num' || k === 'money';
  const td: CSSProperties = {
    padding: cl.img ? '8px 12px' : '11px 12px',
    verticalAlign: cl.img ? 'middle' : 'top',
    width: cl.img ? 88 : undefined,
    textAlign: k === 'num' || k === 'money' ? 'right' : 'left',
    fontFamily: isMono ? mono : 'inherit',
    whiteSpace: k === 'wrap' ? 'normal' : 'nowrap',
    color: k === 'mute' ? 'var(--mute)' : 'inherit',
    fontSize: isMono ? 12.5 : 13,
    minWidth: k === 'wrap' ? 200 : 0,
    lineHeight: 1.45,
    ...cl.style,
  };
  if (cl.img) {
    const img = cl.img;
    const frame: CSSProperties = {
      position: 'relative',
      width: 64,
      height: 48,
      padding: 0,
      borderRadius: 8,
      border: '1px solid var(--line2)',
      background: 'var(--lane)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--mute)',
      cursor: img.onClick ? 'pointer' : 'default',
    };
    const inner = img.src ? (
      // eslint-disable-next-line @next/next/no-img-element -- a 64px thumbnail from Cloudinary
      <img src={img.src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    ) : (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10.5 }}>
        <Icon name="image" size={16} />
        {img.onClick ? 'Add' : 'None'}
      </span>
    );
    return (
      <td style={td}>
        {img.onClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              img.onClick?.();
            }}
            aria-label={img.alt}
            data-tip={img.src ? 'Change photo' : 'Add a photo'}
            style={frame}
          >
            {inner}
          </button>
        ) : (
          // Nothing to do with it: a picture, not a button.
          <span role="img" aria-label={img.alt} style={frame}>
            {inner}
          </span>
        )}
      </td>
    );
  }
  const body =
    k === 'chip' ? (
      <span style={chip(cl.tone ?? statusTone(cl.t))}>{cl.t}</span>
    ) : first && onOpen ? (
      // The first cell opens the row for keyboard users; the whole row opens on click.
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        style={{
          padding: 0,
          border: 'none',
          background: 'transparent',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'inherit',
          cursor: 'pointer',
        }}
      >
        {cl.t}
      </button>
    ) : (
      <span>{cl.t}</span>
    );
  return (
    <td style={td}>
      {body}
      {cl.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--mute)', fontFamily: 'var(--font-sans)' }}>{cl.sub}</span>}
    </td>
  );
}

export function ActionButton({ a, size = 'sm' }: { a: Action; size?: 'sm' | 'lg' }) {
  const colors = btnColors(a.kind);
  const lg = size === 'lg';
  return (
    <button
      type="button"
      onClick={a.on}
      disabled={a.disabled}
      aria-label={a.label}
      data-tip={a.hint || (a.iconOnly ? a.label : undefined)}
      className="aw-press"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: lg ? undefined : 34,
        height: lg ? 40 : 34,
        padding: a.iconOnly ? 0 : a.icon ? (lg ? '0 14px' : '0 12px 0 10px') : lg ? '0 14px' : '0 12px',
        whiteSpace: 'nowrap',
        borderRadius: 8,
        border: `1px solid ${colors.borderColor}`,
        background: colors.background,
        color: colors.color,
        fontSize: lg ? 13 : 12.5,
      }}
    >
      {a.icon && <Icon name={a.icon} size={16} />}
      {!a.iconOnly && <span>{a.label}</span>}
    </button>
  );
}
