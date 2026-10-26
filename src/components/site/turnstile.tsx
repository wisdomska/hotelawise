'use client';
// Cloudflare Turnstile, invisible unless Cloudflare needs the visitor to click.
// It adds a `cf-turnstile-response` field to the surrounding form.
import { Turnstile as CfTurnstile } from '@marsidev/react-turnstile';

export function Turnstile({ siteKey }: { siteKey: string | null }) {
  if (!siteKey) return null;
  return <CfTurnstile siteKey={siteKey} options={{ appearance: 'interaction-only', size: 'flexible', theme: 'light' }} />;
}
