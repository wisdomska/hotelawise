'use client';
import { useActionState, useEffect, useRef } from 'react';
import { subscribeNewsletter, type FormResult } from '@/app/(site)/actions';
import { notify } from '@/components/ui/toaster';
import { Turnstile } from './turnstile';

export function NewsletterForm({ siteKey }: { siteKey: string | null }) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(subscribeNewsletter, null);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    if (state?.ok) {
      notify(state.title, state.body);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      aria-label="Newsletter"
      noValidate
      style={{ marginTop: 'auto', display: 'flex', gap: 8, maxWidth: 460, flexWrap: 'wrap', alignItems: 'flex-end' }}
    >
      <label style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'rgba(0,0,58,0.65)' }}>
        The occasional letter: rates and openings, no spam
        <input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="you@example.com"
          required
          aria-invalid={!!error}
          aria-describedby={error ? 'news-error' : undefined}
          style={{
            height: 46,
            padding: '0 14px',
            borderRadius: 10,
            border: `1.5px solid ${error ? '#B42318' : 'rgba(0,0,99,0.2)'}`,
            background: '#F5F2EA',
            fontSize: 16,
            color: '#00003A',
          }}
        />
        {error && (
          <span id="news-error" role="alert" style={{ color: '#B42318', fontSize: 12 }}>
            {error}
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={pending}
        data-mi-btn="fill"
        style={{
          height: 46,
          padding: '0 18px',
          borderRadius: 10,
          border: 'none',
          background: '#000063',
          color: '#F5F2EA',
          fontSize: 14,
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? 'Subscribing…' : 'Subscribe'}
      </button>
      <Turnstile siteKey={siteKey} />
    </form>
  );
}
