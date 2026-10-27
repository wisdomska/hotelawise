'use client';
// Contact page form (Website.dc.html › CONTACT): subject chips, name, phone with
// country code, optional email and the message. Saved to Admin › Inbox.
import { useActionState, useEffect, useRef, useState } from 'react';
import { sendContactMessage, type ContactResult } from '@/app/(site)/actions';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import { notify } from '@/components/ui/toaster';
import { checkContact, CONTACT_SUBJECTS, DIAL_CODES, type ContactErrors, type ContactField } from '@/lib/contact-form';
import { Turnstile } from './turnstile';

const field = (bad: boolean): React.CSSProperties => ({
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: `1.5px solid ${bad ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
  background: '#F5F2EA',
  fontSize: 16,
  color: '#00003A',
});
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 };

function Label({ icon, children }: { icon: AnyIconName; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <span id={id} role="alert" style={{ color: '#B42318', fontSize: 12 }}>
      {text}
    </span>
  );
}

export function ContactForm({ siteKey }: { siteKey: string | null }) {
  const [state, action, pending] = useActionState<ContactResult | null, FormData>(sendContactMessage, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [subject, setSubject] = useState<string>(CONTACT_SUBJECTS[0]);
  const [dialCode, setDialCode] = useState('+233');
  const [local, setLocal] = useState<ContactErrors>({});
  const [seen, setSeen] = useState<ContactResult | null>(null);

  // Server errors replace local ones when a new result arrives; typing clears a field's error.
  if (state !== seen) {
    setSeen(state);
    setLocal(state && !state.ok ? (state.errors ?? {}) : {});
  }
  useEffect(() => {
    if (state?.ok) {
      notify(state.title, state.body);
      formRef.current?.reset();
    }
  }, [state]);

  const errors = local;
  const clear = (k: ContactField) => errors[k] && setLocal({ ...errors, [k]: undefined });
  const formError = state && !state.ok ? state.error : undefined;

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      aria-label="Contact form"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        const r = checkContact({
          subject,
          name: String(f.get('name') ?? ''),
          dialCode,
          phone: String(f.get('phone') ?? ''),
          email: String(f.get('email') ?? ''),
          message: String(f.get('message') ?? ''),
        });
        if (!r.ok) {
          e.preventDefault();
          setLocal(r.errors);
          const first = (['name', 'phone', 'email', 'message'] as const).find((k) => r.errors[k]);
          if (first) e.currentTarget.querySelector<HTMLElement>(`[name=${first}]`)?.focus();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,99,0.14)',
        borderRadius: 10,
        padding: 24,
        alignSelf: 'start',
      }}
    >
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>Send a message</span>
      <input type="hidden" name="subject" value={subject} />
      <div role="radiogroup" aria-label="Subject" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CONTACT_SUBJECTS.map((s) => {
          const on = s === subject;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              data-mi-btn="chip"
              onClick={() => setSubject(s)}
              style={{
                height: 'max(36px, var(--tap-min, 0px))',
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${on ? '#000063' : 'rgba(0,0,99,0.25)'}`,
                background: on ? '#000063' : 'transparent',
                color: on ? '#F5F2EA' : '#00003A',
                fontSize: 13,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
      <label style={labelStyle}>
        <Label icon="user">Your name</Label>
        <input
          name="name"
          placeholder="e.g. Ama Owusu"
          autoComplete="name"
          maxLength={120}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'cf-name-err' : undefined}
          onChange={() => clear('name')}
          style={field(!!errors.name)}
        />
        <FieldError id="cf-name-err" text={errors.name} />
      </label>
      <div style={labelStyle}>
        <label htmlFor="cf-phone">
          <Label icon="phone">Phone</Label>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="hidden" name="dialCode" value={dialCode} />
          <Select
            variant="field"
            mono
            width={132}
            panelWidth={200}
            ariaLabel="Country code"
            value={dialCode}
            options={DIAL_CODES}
            onChange={setDialCode}
          />
          <input
            id="cf-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            enterKeyHint="next"
            placeholder="555557090"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'cf-phone-err' : undefined}
            onChange={() => clear('phone')}
            style={{ ...field(!!errors.phone), flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <FieldError id="cf-phone-err" text={errors.phone} />
      </div>
      <label style={labelStyle}>
        <Label icon="mail">Email (optional)</Label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'cf-email-err' : undefined}
          onChange={() => clear('email')}
          style={field(!!errors.email)}
        />
        <FieldError id="cf-email-err" text={errors.email} />
      </label>
      <label style={labelStyle}>
        <Label icon="message">Message</Label>
        <textarea
          name="message"
          rows={4}
          maxLength={4000}
          placeholder="e.g. We land at 2am on Friday. Can someone meet us at the gate?"
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'cf-msg-err' : undefined}
          onChange={() => clear('message')}
          style={{ ...field(!!errors.message), height: 'auto', padding: '12px 14px', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <FieldError id="cf-msg-err" text={errors.message} />
      </label>
      <Turnstile siteKey={siteKey} />
      {formError && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B42318' }}>
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-mi-btn="fill"
        style={{ minHeight: 52, border: 'none', borderRadius: 10, background: '#000063', color: '#F5F2EA', fontSize: 15, fontWeight: 500 }}
      >
        {pending ? 'Sending…' : 'Send to reception'}
      </button>
      <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
        Urgent? Calling is faster. Reception replies to messages within the hour.
      </span>
    </form>
  );
}
