'use client';
// Port of design/motion.js: scroll reveal (enter and leave), stagger and hero
// parallax. Transform/opacity/filter only. Under prefers-reduced-motion nothing
// moves: content is simply shown.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';
const BLOCKS = 'main section:not([data-noreveal]) > *:not([data-noreveal]), footer[data-screen-label] > *, [data-reveal]';

type Revealable = HTMLElement & { __awItem?: boolean; __awDelay?: number; __awShown?: boolean };

export function MotionLayer() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new WeakSet<Element>();
    const parallax: HTMLElement[] = [];

    const hide = (el: Revealable, fromBelow: boolean) => {
      if (el.__awItem) {
        el.style.translate = `0 ${fromBelow ? 16 : -10}px`;
        el.style.filter = 'opacity(0)';
      } else {
        el.style.translate = `0 ${fromBelow ? 28 : -18}px`;
        el.style.opacity = '0';
      }
    };
    const show = (el: Revealable) => {
      el.style.translate = '0 0';
      if (el.__awItem) el.style.filter = '';
      else el.style.opacity = '';
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as Revealable;
          if (e.isIntersecting) {
            el.style.transitionDelay = `${el.__awDelay ?? 0}ms`;
            show(el);
            el.__awShown = true;
          } else if (el.__awShown) {
            const vh = e.rootBounds?.height ?? window.innerHeight;
            const rb = e.boundingClientRect;
            if (rb.bottom > 0 && rb.top < vh) continue;
            el.style.transitionDelay = '0ms';
            hide(el, rb.top > vh / 2);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );

    const register = (el: Revealable, isItem: boolean, delay: number) => {
      if (seen.has(el)) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky' || el.offsetParent === null) return;
      // Already on screen at load: leave it alone so first paint never flickers.
      const r = el.getBoundingClientRect();
      seen.add(el);
      if (r.top < window.innerHeight && r.bottom > 0) return;
      el.__awItem = isItem;
      el.__awDelay = delay;
      const add = isItem
        ? 'translate 720ms cubic-bezier(0.22,1,0.36,1), filter 600ms cubic-bezier(0.22,1,0.36,1)'
        : `translate 680ms ${EASE}, opacity 560ms ${EASE}`;
      el.style.transition = el.style.transition ? `${el.style.transition}, ${add}` : add;
      hide(el, true);
      io.observe(el);
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => register(el, false, 0));
      document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((parent) => {
        let i = 0;
        for (const child of Array.from(parent.children) as HTMLElement[]) {
          if (seen.has(child)) continue;
          register(child, true, Math.min(i * 70, 280));
          i++;
        }
      });
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        parallax.push(el);
        el.animate?.([{ scale: '1.07' }, { scale: '1' }], { duration: 1800, easing: EASE, fill: 'both' });
      });
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        for (const el of parallax) {
          if (!el.isConnected || !el.parentElement) continue;
          const r = el.parentElement.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;
          const k = parseFloat(el.getAttribute('data-parallax') ?? '') || 0.12;
          el.style.translate = `0 ${Math.round(-r.top * k)}px`;
        }
      });
    };

    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        scan();
      });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    schedule();
    return () => {
      mo.disconnect();
      io.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pathname]);

  return null;
}
