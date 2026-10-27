'use client';
// Locks page scroll while an overlay is open. Counted, so a lightbox opened over
// the reserve drawer doesn't unlock the page when it closes.
import { useEffect } from 'react';

let locks = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks === 0) document.documentElement.style.overflow = '';
    };
  }, [active]);
}
