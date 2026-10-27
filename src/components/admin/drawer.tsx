'use client';
// The right-hand detail drawer from Admin.dc.html: kicker, serif title, status
// chip, a definition list, receipt-style sections, staff notes and actions.
import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import type { ActionResult } from '@/lib/admin/result';
import { ActionButton } from './table';
import { useAdmin } from './context';
import { useFocusTrap } from './focus-trap';
import type { Line } from './modal';
import { chip, EASE, mono, serif, statusTone, type Action } from './ui';

export type DrawerField = { k: string; v: string; mono?: boolean };
export type DrawerSection = { title: string; lines: Line[]; empty?: string };

type Props = {
  kicker: string;
  title: string;
  status: string;
  tone?: Parameters<typeof chip>[0];
  fields: DrawerField[];
  sections?: DrawerSection[];
  note?: { value: string; save: (v: string) => Promise<ActionResult> };
  actions?: Action[];
  children?: ReactNode;
};

export function DrawerShell({ label, children }: { label: string; children: ReactNode }) {
  const { closeDrawer } = useAdmin();
  const ref = useRef<HTMLElement>(null);
  useFocusTrap(ref, 'container');
  return (
    <>
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.35)', animation: `aw-fade 200ms ${EASE}` }}
      />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          width: 'min(460px,100%)',
          background: 'var(--panel)',
          color: 'var(--ink)',
          borderLeft: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          animation: `aw-slide 300ms ${EASE}`,
          outline: 'none',
        }}
      >
        {children}
      </aside>
    </>
  );
}

export function DrawerLoading({ label }: { label: string }) {
  return (
    <DrawerShell label={label}>
      <div aria-busy="true" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[60, 200, 140, 140].map((h, i) => (
          <div
            key={i}
            style={{ height: h, borderRadius: 10, background: 'var(--lane)', animation: 'aw-shimmer 1.4s ease-in-out infinite' }}
          />
        ))}
      </div>
    </DrawerShell>
  );
}

export function DrawerFrame(p: Props) {
  const { closeDrawer } = useAdmin();
  return (
    <DrawerShell label={p.title}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--mute)' }}>{p.kicker}</span>
          <h2 style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 26, lineHeight: 1.1 }}>{p.title}</h2>
          <span style={chip(p.tone ?? statusTone(p.status))}>{p.status}</span>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close"
          data-tip="Close (Esc)"
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'transparent',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      <div
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 13 }}>
          {p.fields.map((f) => (
            <div key={f.k} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--mute)' }}>{f.k}</dt>
              <dd style={{ margin: 0, fontFamily: f.mono ? mono : 'inherit', overflowWrap: 'anywhere' }}>{f.v}</dd>
            </div>
          ))}
        </dl>
        {(p.sections ?? []).map((sec) => (
          <div
            key={sec.title}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px dashed var(--line2)' }}
          >
            <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.06em', color: 'var(--mute)' }}>{sec.title}</span>
            {sec.lines.map((l, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: mono, fontSize: 12.5, color: l.color ?? 'inherit' }}
              >
                <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.k}
                </span>
                <span style={{ flex: '1 1 12px', minWidth: 12, borderBottom: '1px dotted var(--line2)', transform: 'translateY(-4px)' }} />
                <span style={{ whiteSpace: 'nowrap' }}>{l.v}</span>
              </div>
            ))}
            {sec.empty && !sec.lines.length && <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{sec.empty}</span>}
          </div>
        ))}
        {p.children}
        {p.note && <StaffNote {...p.note} />}
      </div>
      {!!p.actions?.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
          {p.actions.map((a) => (
            <ActionButton key={a.label} a={{ ...a, iconOnly: false }} size="lg" />
          ))}
        </div>
      )}
    </DrawerShell>
  );
}

/** Saved when the field loses focus; guests never see these. */
function StaffNote({ value, save }: { value: string; save: (v: string) => Promise<ActionResult> }) {
  const id = useId();
  const [v, setV] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const last = useRef(value);
  const commit = async () => {
    if (v === last.current) return;
    setState('saving');
    const r = await save(v).catch(() => ({ ok: false }) as ActionResult);
    if (r.ok) {
      last.current = v;
      setState('saved');
    } else setState('error');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--mute)' }}>
      <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>Staff notes (guests never see these)</span>
        <span role="status" style={{ color: state === 'error' ? 'var(--red)' : 'var(--mute)' }}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved. Try again.' : ''}
        </span>
      </label>
      <textarea
        id={id}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setState('idle');
        }}
        onBlur={commit}
        placeholder="e.g. Prefers a quiet room, arriving late"
        rows={3}
        maxLength={2000}
        style={{
          padding: 10,
          borderRadius: 8,
          border: '1px solid var(--field)',
          background: 'var(--bg)',
          color: 'var(--ink)',
          fontSize: 13.5,
          resize: 'vertical',
        }}
      />
    </div>
  );
}
