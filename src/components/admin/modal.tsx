'use client';
// The admin modal from Admin.dc.html and the pieces modals are built from:
// step bar, field grid (text, area, select, date), stepper rows, receipt lines
// and the info note. One modal at a time, hosted by the shell.
import { useId, useRef, type ReactNode } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Stepper } from '@/components/checkout/stepper';
import { Icon } from '@/components/ui/icon';
import { Select, type SelectOption } from '@/components/ui/select';
import type { IsoDate } from '@/lib/dates';
import type { ActionResult } from '@/lib/admin/result';
import { useAdmin } from './context';
import { useFocusTrap } from './focus-trap';
import { useAction } from './use-action';
import { EASE, mono, serif } from './ui';

export function ModalHost() {
  const { modal } = useAdmin();
  return modal ? <>{modal}</> : null;
}

type FrameProps = {
  title: string;
  sub?: string;
  steps?: { labels: string[]; idx: number };
  confirm: string;
  onConfirm: () => void;
  danger?: boolean;
  /** Defaults to Cancel / Back (on later steps). */
  secondary?: { label: string; on: () => void };
  busy?: boolean;
  children?: ReactNode;
};

export function ModalFrame(p: FrameProps) {
  const { closeModal } = useAdmin();
  const titleId = useId();
  const sec = p.secondary ?? { label: 'Cancel', on: closeModal };
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: `aw-fade 180ms ${EASE}`,
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!p.busy) p.onConfirm();
        }}
        style={{
          width: 'min(620px,100%)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: 'var(--panel)',
          color: 'var(--ink)',
          borderRadius: 14,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: `aw-pop 240ms ${EASE}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 id={titleId} style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 26, lineHeight: 1.1 }}>
              {p.title}
            </h2>
            {p.sub && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--mute)' }}>{p.sub}</span>}
          </div>
          <button
            type="button"
            onClick={closeModal}
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
        {p.steps && (
          <div
            style={
              {
                '--step-on': 'var(--pri-bg)',
                '--step-on-fg': 'var(--pri-fg)',
                '--step-ink': 'var(--ink)',
                '--step-mute': 'var(--mute)',
                '--step-line': 'var(--line2)',
                '--step-edge': 'var(--line2)',
                '--step-ring': 'color-mix(in srgb, var(--pri-bg) 18%, transparent)',
              } as React.CSSProperties
            }
          >
            <Stepper steps={p.steps.labels} current={p.steps.idx + 1} label="Steps" />
          </div>
        )}
        {p.children}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>{p.steps ? `Step ${p.steps.idx + 1} of ${p.steps.labels.length}` : ''}</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={sec.on}
              style={{
                height: 40,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--line2)',
                background: 'transparent',
                fontSize: 13,
              }}
            >
              {sec.label}
            </button>
            <button
              type="submit"
              disabled={p.busy}
              aria-busy={p.busy || undefined}
              style={{
                height: 40,
                padding: '0 16px',
                border: 'none',
                borderRadius: 8,
                background: p.danger ? 'var(--red)' : 'var(--pri-bg)',
                color: p.danger ? '#FFFFFF' : 'var(--pri-fg)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {p.busy ? 'Working…' : p.confirm}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function FieldGrid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14 }}>{children}</div>;
}

type Base = { label: string; err?: string; hint?: string; wide?: boolean };

function Wrap({ label, err, hint, wide, children, htmlFor }: Base & { children: ReactNode; htmlFor?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 12.5,
        color: 'var(--mute)',
        gridColumn: wide ? '1 / -1' : 'auto',
      }}
    >
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {children}
      {err && (
        <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
          {err}
        </span>
      )}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{hint}</span>}
    </div>
  );
}

const inputStyle = (err?: string): React.CSSProperties => ({
  height: 40,
  padding: '0 10px',
  borderRadius: 8,
  border: `1px solid ${err ? 'var(--red)' : 'var(--field)'}`,
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontSize: 13.5,
});

export function TextField(
  p: Base & {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: 'text' | 'email' | 'password' | 'tel';
    numeric?: boolean;
    autoComplete?: string;
    mono?: boolean;
  },
) {
  const id = useId();
  return (
    <Wrap {...p} htmlFor={id}>
      <input
        id={id}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        type={p.type ?? 'text'}
        inputMode={p.numeric ? 'decimal' : p.type === 'tel' ? 'tel' : undefined}
        autoComplete={p.autoComplete ?? (p.type === 'password' ? 'current-password' : 'off')}
        aria-invalid={p.err ? true : undefined}
        style={{ ...inputStyle(p.err), fontFamily: p.mono ? mono : undefined }}
      />
    </Wrap>
  );
}

/** "We ask for this whenever money moves." */
export function PasswordField(p: { value: string; onChange: (v: string) => void; err?: string; hint?: string; wide?: boolean }) {
  return (
    <TextField
      label="Your password"
      type="password"
      placeholder="Your sign-in password"
      hint={p.hint ?? 'We ask for this whenever money moves.'}
      {...p}
    />
  );
}

export function AreaField(p: Base & { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <Wrap {...p} htmlFor={id}>
      <textarea
        id={id}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        rows={p.rows ?? 4}
        aria-invalid={p.err ? true : undefined}
        style={{
          padding: 10,
          borderRadius: 8,
          border: `1px solid ${p.err ? 'var(--red)' : 'var(--field)'}`,
          background: 'var(--bg)',
          color: 'var(--ink)',
          fontSize: 13.5,
          lineHeight: 1.5,
          resize: 'vertical',
        }}
      />
    </Wrap>
  );
}

export function SelectField(p: Base & { value: string; onChange: (v: string) => void; options: readonly SelectOption[] }) {
  return (
    <Wrap {...p}>
      <Select
        variant="compact"
        ariaLabel={p.label}
        value={p.value}
        options={p.options}
        onChange={p.onChange}
        width="100%"
        error={!!p.err}
      />
    </Wrap>
  );
}

export function DateField(p: Base & { value: IsoDate | ''; onChange: (v: IsoDate) => void; min?: IsoDate }) {
  return (
    <Wrap {...p}>
      <DatePicker variant="field" compact value={p.value} min={p.min} onChange={p.onChange} error={!!p.err} label={p.label} />
    </Wrap>
  );
}

export type Line = { k: string; v: string; color?: string; weight?: number };

export function Lines({ lines, dashed = true }: { lines: Line[]; dashed?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingTop: dashed ? 12 : 0,
        borderTop: dashed ? '1px dashed var(--line2)' : 'none',
        fontFamily: mono,
        fontSize: 12.5,
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: l.color ?? 'inherit', fontWeight: l.weight ?? 400 }}>
          <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.k}</span>
          <span style={{ flex: '1 1 12px', minWidth: 12, borderBottom: '1px dotted var(--line2)', transform: 'translateY(-4px)' }} />
          <span style={{ whiteSpace: 'nowrap' }}>{l.v}</span>
        </div>
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>
      <Icon name="info" size={15} />
      <span>{children}</span>
    </span>
  );
}

export type StepperRow = {
  label: string;
  sub?: string;
  steppers: { value: number; dec: () => void; inc: () => void; label: string }[];
  amount: string;
  color?: string;
};

export function StepperRows({ cols, rows }: { cols: string[]; rows: StepperRow[] }) {
  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 480, fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c}
                scope="col"
                style={{
                  textAlign: i === cols.length - 1 ? 'right' : 'left',
                  padding: '6px 8px',
                  fontWeight: 400,
                  fontSize: 11,
                  color: 'var(--mute)',
                  fontFamily: mono,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: 8 }}>
                {r.label}
                {r.sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--mute)' }}>{r.sub}</span>}
              </td>
              {r.steppers.map((sp) => (
                <td key={sp.label} style={{ padding: 8 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--line2)', borderRadius: 8 }}>
                    <button
                      type="button"
                      onClick={sp.dec}
                      aria-label={`Fewer: ${sp.label}`}
                      style={{ width: 32, height: 32, border: 'none', background: 'transparent' }}
                    >
                      −
                    </button>
                    <span aria-live="polite" style={{ fontFamily: mono, minWidth: 34, textAlign: 'center', fontSize: 12.5 }}>
                      {sp.value}
                    </span>
                    <button
                      type="button"
                      onClick={sp.inc}
                      aria-label={`More: ${sp.label}`}
                      style={{ width: 32, height: 32, border: 'none', background: 'transparent' }}
                    >
                      +
                    </button>
                  </div>
                </td>
              ))}
              <td style={{ padding: 8, fontFamily: mono, fontSize: 12.5, textAlign: 'right', color: r.color ?? 'inherit' }}>{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A red "are you sure?" modal (prototype openConfirm). */
export function ConfirmModal(p: { title: string; sub: string; confirm: string; run: () => Promise<ActionResult>; then?: () => void }) {
  const { closeModal } = useAdmin();
  const { run, busy } = useAction();
  return (
    <ModalFrame
      title={p.title}
      sub={p.sub}
      confirm={p.confirm}
      danger
      busy={busy}
      onConfirm={async () => {
        const r = await run(p.run);
        if (r.ok) p.then?.();
      }}
      secondary={{ label: 'Go back', on: closeModal }}
    />
  );
}
