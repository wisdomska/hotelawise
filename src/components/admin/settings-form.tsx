'use client';
// The settings/content form card from Admin.dc.html: fields in a grid, an
// "unsaved changes" status, Discard and Save. Saves only what changed.
import { useId, useState } from 'react';
import type { ActionResult } from '@/lib/admin/result';
import { Switch } from './page-parts';
import { useAction } from './use-action';
import { mono, panel } from './ui';

export type FormField =
  | {
      key: string;
      label: string;
      kind: 'text' | 'area';
      mono?: boolean;
      wide?: boolean;
      hint?: string;
      placeholder?: string;
      type?: 'text' | 'email' | 'tel';
    }
  | { key: string; label: string; kind: 'toggle'; hint?: string; locked?: boolean }
  | { key: string; label: string; kind: 'secret'; hint?: string };

type Values = Record<string, string | boolean>;

type Props = {
  title: string;
  note?: string;
  fields: FormField[];
  values: Values;
  readOnly?: boolean;
  save?: (patch: Values) => Promise<ActionResult>;
};

export function SettingsForm(p: Props) {
  const [draft, setDraft] = useState<Values>({});
  const { run, busy, errors } = useAction();
  const dirty = Object.keys(draft).filter((k) => draft[k] !== p.values[k]);
  const val = (k: string) => (k in draft ? draft[k] : p.values[k]);
  const set = (k: string, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  const headId = useId();
  return (
    <section aria-labelledby={headId} style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id={headId} style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          {p.title}
        </h2>
        {p.note && <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--mute)' }}>{p.note}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {p.fields.map((f) => (
          <Field key={f.key} f={f} value={val(f.key)} ro={!!p.readOnly} err={errors[f.key]} onChange={(v) => set(f.key, v)} />
        ))}
      </div>
      {!p.readOnly && p.save && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
          }}
        >
          <span
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              whiteSpace: 'nowrap',
              color: dirty.length ? 'var(--amber-ink)' : 'var(--green)',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
            <span>{dirty.length ? `${dirty.length} unsaved change${dirty.length > 1 ? 's' : ''}` : 'All changes saved'}</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={!dirty.length || busy}
              onClick={() => setDraft({})}
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--line2)',
                background: 'transparent',
                fontSize: 13,
              }}
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!dirty.length || busy}
              onClick={async () => {
                const patch: Values = {};
                for (const k of dirty) patch[k] = draft[k] ?? '';
                const r = await run(() => p.save!(patch), { close: false });
                if (r.ok) setDraft({});
              }}
              style={{
                height: 38,
                padding: '0 16px',
                border: 'none',
                borderRadius: 8,
                background: 'var(--pri-bg)',
                color: 'var(--pri-fg)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  f,
  value,
  ro,
  err,
  onChange,
}: {
  f: FormField;
  value: string | boolean | undefined;
  ro: boolean;
  err?: string;
  onChange: (v: string | boolean) => void;
}) {
  const id = useId();
  const wide = 'wide' in f && f.wide;
  const label = (
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {f.label}
    </label>
  );
  const box: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12.5,
    color: 'var(--mute)',
    gridColumn: wide || f.kind === 'area' ? '1 / -1' : 'auto',
  };
  const inputBase: React.CSSProperties = {
    borderRadius: 8,
    border: `1px solid ${err ? 'var(--red)' : 'var(--field)'}`,
    background: ro ? 'var(--lane)' : 'var(--bg)',
    color: 'var(--ink)',
    fontSize: 13.5,
  };
  return (
    <div style={box}>
      {f.kind === 'toggle' ? <span>{f.label}</span> : label}
      {f.kind === 'toggle' ? (
        <Switch checked={!!value} disabled={ro || f.locked} label={f.label} onChange={() => onChange(!value)} />
      ) : f.kind === 'area' ? (
        <textarea
          id={id}
          value={String(value ?? '')}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          rows={3}
          style={{ ...inputBase, padding: 10, lineHeight: 1.5, resize: 'vertical' }}
        />
      ) : (
        <input
          id={id}
          value={f.kind === 'secret' ? '••••••••••••••••' : String(value ?? '')}
          readOnly={ro || f.kind === 'secret'}
          type={f.kind === 'text' ? (f.type ?? 'text') : 'text'}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.kind === 'text' ? f.placeholder : undefined}
          aria-invalid={err ? true : undefined}
          style={{
            ...inputBase,
            height: 40,
            padding: '0 10px',
            fontFamily: f.kind === 'secret' || (f.kind === 'text' && f.mono) ? mono : undefined,
          }}
        />
      )}
      {err && (
        <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
          {err}
        </span>
      )}
      {f.hint && <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--mute)' }}>{f.hint}</span>}
    </div>
  );
}
