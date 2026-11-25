'use client';
// Cloudflare Turnstile in invisible mode: it checks the visitor in the background and
// never shows a box (the widgets are set to "invisible" in Cloudflare, DECISIONS D-51).
// It adds a `cf-turnstile-response` field to the surrounding form.
//
// `lazy` (the footer newsletter, contact and venue forms) loads it only when someone first
// touches the form: Turnstile is 2–6 MB of scripts and frames, and the footer form is on
// every page (D-60). A submit that beats the check waits for it (up to 8 seconds), then
// goes through as usual; the server still verifies every token.
import { Turnstile as CfTurnstile } from '@marsidev/react-turnstile';
import { useEffect, useRef, useState } from 'react';

const WAIT_MS = 8000;

export function Turnstile({
  siteKey,
  onToken,
  lazy = false,
}: {
  siteKey: string | null;
  onToken?: (token: string | null) => void;
  lazy?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(!lazy);
  const token = useRef<string | null>(null);
  // Set once a held submit has been let through, so the resubmit isn't held again.
  const released = useRef(false);
  const waiting = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!lazy || !siteKey) return;
    const form = anchor.current?.closest('form');
    if (!form) return;
    const arm = () => setArmed(true);
    // A submit that arrives before the check has finished waits for it, then resubmits.
    const onSubmit = (e: SubmitEvent) => {
      if (token.current || released.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setArmed(true);
      if (waiting.current) return;
      const submitter = e.submitter instanceof HTMLElement ? e.submitter : undefined;
      const go = () => {
        clearTimeout(timer);
        waiting.current = null;
        // Let the resubmit through even without a token: the server then answers with its
        // usual "couldn't confirm" message instead of the form waiting forever.
        released.current = true;
        // A beat for React to re-render, so forms that keep the token in state see it.
        setTimeout(() => form.requestSubmit(submitter as HTMLButtonElement | undefined), 120);
      };
      const timer = setTimeout(go, WAIT_MS);
      waiting.current = go;
    };
    form.addEventListener('focusin', arm, { once: true });
    form.addEventListener('pointerdown', arm, { once: true });
    form.addEventListener('submit', onSubmit, { capture: true });
    return () => {
      form.removeEventListener('focusin', arm);
      form.removeEventListener('pointerdown', arm);
      form.removeEventListener('submit', onSubmit, { capture: true });
    };
  }, [lazy, siteKey]);

  if (!siteKey) return null;
  return (
    <span ref={anchor} style={{ display: 'contents' }}>
      {armed && (
        <CfTurnstile
          siteKey={siteKey}
          options={{ appearance: 'interaction-only', size: 'invisible' }}
          onSuccess={(t) => {
            token.current = t;
            onToken?.(t);
            waiting.current?.();
          }}
          onExpire={() => {
            token.current = null;
            onToken?.(null);
          }}
        />
      )}
    </span>
  );
}
