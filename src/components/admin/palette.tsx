'use client';
// ⌘K: jump to a screen, run an action, or find a booking, order or customer.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { searchAdmin, type Hit } from '@/app/admin/(app)/search';
import { useAdmin } from './context';
import type { NavGroup } from './shell';
import { EASE, mono } from './ui';

type Item = { label: string; kind: string; run: () => void };

type Props = {
  groups: NavGroup[];
  dark: boolean;
  onClose: () => void;
  onNewBooking: () => void;
  onToggleDark: () => void;
  onSignOut: () => void;
};

export function Palette(p: Props) {
  const router = useRouter();
  const { openDrawer, can } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchAdmin(term)
        .then((h) => live && setHits(h))
        .catch(() => live && setHits([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const screens: Item[] = p.groups
    .flatMap((g) => g.items)
    .map((it) => ({ label: it.label, kind: 'Screen', run: () => router.push(it.href) }));
  const actions: Item[] = [
    ...(can('bookings.create') ? [{ label: 'New booking', kind: 'Action', run: p.onNewBooking }] : []),
    { label: p.dark ? 'Switch to light mode' : 'Switch to dark mode', kind: 'Action', run: p.onToggleDark },
    { label: 'My account', kind: 'Screen', run: () => router.push('/admin/account') },
    { label: 'Sign out', kind: 'Action', run: p.onSignOut },
  ];
  const records: Item[] = (q.trim().length >= 2 ? hits : []).map((h) => ({
    label: h.label,
    kind: h.kind,
    run: () => {
      router.push(h.href);
      if (h.kind === 'Booking') openDrawer({ kind: 'booking', ref: h.ref });
      else if (h.kind === 'Rental') openDrawer({ kind: 'rental', ref: h.ref });
      else openDrawer({ kind: 'customer', id: h.ref });
    },
  }));
  const term = q.trim().toLowerCase();
  const list = (
    term
      ? [...screens, ...actions].filter((x) => x.label.toLowerCase().includes(term)).concat(records)
      : [...screens.slice(0, 6), ...actions]
  ).slice(0, 10);
  const cur = Math.min(idx, Math.max(0, list.length - 1));
  const go = (x: Item) => {
    p.onClose();
    x.run();
  };

  return (
    <div
      onClick={p.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: 'min(12vh, 96px) 16px 16px',
        animation: `aw-fade 150ms ${EASE}`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px,100%)',
          background: 'var(--panel)',
          color: 'var(--ink)',
          borderRadius: 14,
          border: '1px solid var(--line2)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: `aw-pop 200ms ${EASE}`,
          transformOrigin: '50% 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            borderBottom: '1px solid var(--line)',
            color: 'var(--mute)',
          }}
        >
          <Icon name="search" size={17} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx(Math.min(list.length - 1, cur + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx(Math.max(0, cur - 1));
              } else if (e.key === 'Enter' && list[cur]) go(list[cur]);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="aw-pal-list"
            aria-activedescendant={list[cur] ? `aw-pal-${cur}` : undefined}
            placeholder="Jump to a screen, find a guest or booking…"
            aria-label="Search"
            style={{ flex: 1, height: 54, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 15, outline: 'none' }}
          />
        </div>
        <div id="aw-pal-list" role="listbox" style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {list.map((x, i) => (
            <button
              key={x.kind + x.label}
              id={`aw-pal-${i}`}
              type="button"
              role="option"
              aria-selected={i === cur}
              onClick={() => go(x)}
              onMouseEnter={() => setIdx(i)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                minHeight: 40,
                padding: '0 12px',
                border: 'none',
                borderRadius: 8,
                background: i === cur ? 'var(--hover)' : 'transparent',
                textAlign: 'left',
                fontSize: 13.5,
              }}
            >
              <span>{x.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{x.kind}</span>
            </button>
          ))}
          {list.length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: 13, color: 'var(--mute)' }}>
              No matches. Try a guest name or a reference like AW-K2M9.
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            padding: '8px 14px',
            borderTop: '1px solid var(--line)',
            fontFamily: mono,
            fontSize: 11,
            color: 'var(--mute)',
          }}
        >
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
