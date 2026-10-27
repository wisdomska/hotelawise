'use client';
// Keyboard focus for the admin's modal layers (modals, drawers, ⌘K): focus
// moves in when the layer opens, Tab and Shift+Tab cycle inside it, and focus
// goes back to whatever opened it when it closes (WAI-ARIA modal dialog pattern).
import { useEffect, type RefObject } from 'react';

/** Open layers, innermost last: only the top one handles Tab (a modal over a drawer). */
const stack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** The visible, focusable elements inside `root`, in tab order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

/**
 * Keeps Tab inside `ref` while it's mounted. `initial` picks what gets focus on
 * open: 'first' (the first field, else the first button) or 'container' (the
 * layer itself, which must have tabIndex={-1}).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, initial: 'first' | 'container' = 'first') {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!root.contains(document.activeElement)) {
      const items = initial === 'first' ? focusables(root) : [];
      // The first field if there is one, so typing can start straight away; else the first button.
      const first = items.find((el) => el.matches('input, select, textarea')) ?? items[0];
      (first ?? root).focus({ preventScroll: true });
    }
    stack.push(root);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.isConnected || stack[stack.length - 1] !== root) return;
      const items = focusables(root);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(root), 1);
      // Back to the opener, if it's still on the page.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, initial]);
}
