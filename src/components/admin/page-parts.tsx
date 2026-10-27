'use client';
// Screen furniture from Admin.dc.html: the title row with actions, tab bar,
// KPI tiles, the toggle switch and the "Super Admins only" panel.
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { ActionButton } from './table';
import { EASE, mono, panel, serif, type Action } from './ui';

export function PageHeader({ title, sub, actions }: { title: string; sub: string; actions?: Action[] }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 320px' }}>
        <h1
          style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 'var(--admin-h1)', letterSpacing: '-0.02em', lineHeight: 1.1 }}
        >
          {title}
        </h1>
        <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--mute)', textWrap: 'pretty' }}>{sub}</span>
      </div>
      {!!actions?.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <ActionButton key={a.label} a={{ ...a, iconOnly: false }} size="lg" />
          ))}
        </div>
      )}
    </div>
  );
}

export type TabDef = string | [string, number | string];

/** The current tab lives in ?tab= so menus and the palette can link straight to it. */
export function useTab(list: readonly TabDef[], def: string): [string, (t: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const names = list.map((t) => (Array.isArray(t) ? t[0] : t));
  const want = sp.get('tab') ?? '';
  const cur = names.includes(want) ? want : def;
  const set = useCallback(
    (t: string) => {
      const q = new URLSearchParams(sp.toString());
      if (t === def) q.delete('tab');
      else q.set('tab', t);
      for (const k of [...q.keys()]) if (k.startsWith('p_') || k === 'action') q.delete(k);
      const s = q.toString();
      router.replace(s ? `?${s}` : '?', { scroll: false });
    },
    [sp, router, def],
  );
  return [cur, set];
}

export function Tabs({ list, cur, set, label }: { list: readonly TabDef[]; cur: string; set: (t: string) => void; label: string }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid var(--line)',
        position: 'relative',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {list.map((t) => {
        const [name, count] = Array.isArray(t) ? t : [t, ''];
        const sel = cur === name;
        return (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => set(name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 42,
              padding: '0 14px',
              border: 'none',
              background: 'transparent',
              fontSize: 13.5,
              fontWeight: sel ? 500 : 400,
              color: sel ? 'var(--ink)' : 'var(--mute)',
              boxShadow: sel ? 'inset 0 -2px 0 var(--ink)' : 'none',
              whiteSpace: 'nowrap',
              transition: 'color 150ms',
            }}
          >
            {name}
            {count !== '' && count !== 0 && (
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'var(--chip-bg)',
                  color: 'var(--chip-fg)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type Kpi = {
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  trend?: 'trendup' | 'trenddown';
  spark?: ReactNode;
  /** 0–100 */
  meter?: number;
};

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  const n = kpis.length;
  return (
    <div
      className="aw-kpis"
      data-stagger=""
      style={{
        display: 'grid',
        gap: 10,
        ['--kpi-n' as string]: String(Math.min(n, 6)),
        ['--kpi-m' as string]: String(n % 3 === 0 ? 3 : Math.min(n, 4)),
      }}
    >
      {kpis.map((k) => (
        <div key={k.label} style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{k.label}</span>
          <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.value}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: k.subColor ?? 'var(--mute)' }}>
            {k.trend && <Icon name={k.trend} size={14} />}
            {k.sub}
          </span>
          {k.spark && <div style={{ marginTop: 2 }}>{k.spark}</div>}
          {k.meter != null && (
            <div style={{ height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, k.meter))}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'var(--chart)',
                  transition: `width 600ms ${EASE}`,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: sm ? 40 : 44,
        height: sm ? 24 : 26,
        borderRadius: 999,
        border: 'none',
        padding: sm ? 2 : 3,
        background: checked ? 'var(--green)' : 'var(--line2)',
        display: 'inline-flex',
        alignSelf: 'flex-start',
        transition: 'background 200ms',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#FFFFFF',
          transform: `translateX(${checked ? (sm ? 16 : 18) : 0}px)`,
          transition: `transform 200ms ${EASE}`,
        }}
      />
    </button>
  );
}

export function Forbidden({ onHome }: { onHome?: () => void }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        border: '1px dashed var(--line2)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--chip-bg)',
          color: 'var(--chip-fg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="lock" size={20} />
      </span>
      <span style={{ fontFamily: serif, fontSize: 26 }}>This screen is for Super Admins</span>
      <span style={{ fontSize: 14, color: 'var(--mute)' }}>
        If you need access, ask a Super Admin to turn on the permission for your account.
      </span>
      {onHome && (
        <button
          type="button"
          onClick={onHome}
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'transparent',
            fontSize: 13,
          }}
        >
          Back to dashboard
        </button>
      )}
    </div>
  );
}
