'use client';
import { useSearchParams } from 'next/navigation';

/** Builds a link to this screen with some search params changed (pagers and filters). */
export function useHref() {
  const sp = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : '?';
  };
}

/** Starts a file download (CSV exports) without leaving the screen. */
export function download(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
