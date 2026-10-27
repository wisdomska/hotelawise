'use client';
// Cloudflare Turnstile in invisible mode: it checks the visitor in the background and
// never shows a box (the widgets are set to "invisible" in Cloudflare, DECISIONS D-51).
// It adds a `cf-turnstile-response` field to the surrounding form.
import { Turnstile as CfTurnstile } from '@marsidev/react-turnstile';

export function Turnstile({ siteKey, onToken }: { siteKey: string | null; onToken?: (token: string | null) => void }) {
  if (!siteKey) return null;
  return (
    <CfTurnstile
      siteKey={siteKey}
      options={{ appearance: 'interaction-only', size: 'invisible' }}
      onSuccess={(t) => onToken?.(t)}
      onExpire={() => onToken?.(null)}
    />
  );
}
