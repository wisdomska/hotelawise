'use client';
// The signed-in admin frame from Admin.dc.html: navy sidebar (collapsible on
// desktop, a drawer on phones) with live to-do badges, the account menu, the
// sticky header with ⌘K search, "View site" and the light/dark switch. It also
// hosts the drawer, modal, palette, tooltips and toasts, and signs people out
// after the idle time set in Settings › Security.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { authClient } from '@/lib/auth/client';
import type { Capability } from '@/server/auth/permissions';
import { AdminProvider, useAdmin, type Me } from './context';
import { DrawerHost } from './drawer-host';
import { ModalHost } from './modal';
import { Palette } from './palette';
import { TooltipHost } from './tooltip';
import { EASE, mono, serif } from './ui';

export type NavItem = { key: string; href: string; label: string; icon: AnyIconName; badge: number; amber: boolean };
export type NavGroup = { label: string; items: NavItem[] };
export type UmStat = { n: number; label: string; href: string };
export type QuickKey = 'newBooking' | 'newRental' | 'blockDates' | 'addItem';

type Props = {
  me: Me;
  capabilities: Capability[];
  groups: NavGroup[];
  stats: UmStat[];
  quick: QuickKey[];
  timeoutMinutes: number;
  collapsed: boolean;
  theme: 'light' | 'dark';
  children: ReactNode;
};

export function AdminShell(p: Props) {
  return (
    <AdminProvider me={p.me} capabilities={p.capabilities}>
      <Frame {...p} />
    </AdminProvider>
  );
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/admin; max-age=31536000; samesite=lax`;
}

function Frame(p: Props) {
  const router = useRouter();
  const path = usePathname();
  const { me, drawer, modal, closeDrawer, closeModal } = useAdmin();
  const [collapsed, setCollapsed] = useState(p.collapsed);
  const [side, setSide] = useState(false);
  const [dark, setDark] = useState(p.theme === 'dark');
  const [palette, setPalette] = useState(false);

  const toggleCollapse = useCallback(
    (v?: boolean) =>
      setCollapsed((c) => {
        const next = v ?? !c;
        setCookie('aw_side', next ? '1' : '0');
        return next;
      }),
    [],
  );
  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      setCookie('aw_theme', next ? 'dark' : 'light');
      document.querySelector('.admin')?.setAttribute('data-theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);
  const signOut = useCallback(async () => {
    await authClient.signOut();
    router.replace('/admin/login');
    router.refresh();
  }, [router]);
  // The desk booking modal arrives with the bookings screen.
  const newBooking = useCallback(() => router.push('/admin/bookings?action=new'), [router]);

  // Close the phone sidebar after navigating.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setSide(false);
  }

  // ⌘K / Ctrl K search, ⌘B / Ctrl B sidebar, Esc closes the top layer.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        setPalette(true);
      } else if ((e.metaKey || e.ctrlKey) && k === 'b') {
        e.preventDefault();
        toggleCollapse();
      } else if (e.key === 'Escape') {
        if (modal) closeModal();
        else if (palette) setPalette(false);
        else if (drawer) closeDrawer();
        else setSide(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [modal, palette, drawer, closeModal, closeDrawer, toggleCollapse]);

  // Lock page scroll while an overlay is open.
  useEffect(() => {
    const lock = !!(modal || drawer || palette || side);
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [modal, drawer, palette, side]);

  // Idle sign-out.
  useEffect(() => {
    const ms = Math.max(5, p.timeoutMinutes) * 60_000;
    let t = setTimeout(expire, ms);
    function expire() {
      void authClient.signOut().finally(() => {
        router.replace('/admin/login?reason=idle');
        router.refresh();
      });
    }
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(expire, ms);
    };
    const evs = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [p.timeoutMinutes, router]);

  const mini = collapsed;
  const runQuick = (k: QuickKey) => {
    if (k === 'newBooking') newBooking();
    else if (k === 'newRental') window.open('/rent', '_blank', 'noopener');
    else if (k === 'blockDates') router.push('/admin/rooms?tab=Blocked+dates&action=block');
    else router.push('/admin/inventory?action=add');
  };

  return (
    <div className="aw-shell" data-collapsed={mini ? 'true' : 'false'}>
      {side && (
        <div
          aria-hidden="true"
          onClick={() => setSide(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.4)', animation: `aw-fade 200ms ${EASE}` }}
        />
      )}
      <aside className="aw-side" data-open={side ? 'true' : 'false'} aria-label="Admin navigation">
        <button
          type="button"
          onClick={() => toggleCollapse()}
          aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!mini}
          data-tip={`${mini ? 'Expand sidebar' : 'Collapse sidebar'} (Ctrl B)`}
          className="aw-press"
          style={{
            display: 'var(--dflex)',
            position: 'absolute',
            top: 22,
            right: -14,
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: '50%',
            border: '1px solid var(--line2)',
            background: 'var(--panel)',
            color: 'var(--ink)',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            zIndex: 3,
          }}
        >
          <Icon name={mini ? 'chevright' : 'chevleft'} size={14} />
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: mini ? 'center' : 'space-between',
            gap: 10,
            padding: '4px 8px 16px',
            minHeight: 46,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Mark />
            {!mini && <span style={{ fontFamily: serif, fontSize: 20, whiteSpace: 'nowrap' }}>A-Wise Admin</span>}
          </span>
          <button
            type="button"
            onClick={() => setSide(false)}
            aria-label="Close navigation"
            style={{
              display: 'var(--mflex)',
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 8,
              background: 'rgba(245,242,234,0.08)',
              color: '#F5F2EA',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {!mini && <DeskClock />}
        <nav
          aria-label="Screens"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: mini ? 6 : 14,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
            margin: '0 -4px',
            padding: '0 4px',
          }}
        >
          {p.groups.map((g) => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!mini && (
                <span
                  style={{
                    padding: '0 10px 4px',
                    fontFamily: mono,
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    color: 'rgba(245,242,234,0.5)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g.label.toUpperCase()}
                </span>
              )}
              {mini && <span aria-hidden="true" style={{ height: 1, margin: '2px 14px 6px', background: 'rgba(245,242,234,0.12)' }} />}
              {g.items.map((it) => {
                const current = it.href === '/admin' ? path === '/admin' : path.startsWith(it.href);
                const badgeBg = it.amber ? '#F2B544' : '#E3E4F5';
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    aria-current={current ? 'page' : undefined}
                    aria-label={it.label + (it.badge ? `, ${it.badge} to do` : '')}
                    data-tip={mini ? it.label + (it.badge ? ` · ${it.badge}` : '') : undefined}
                    className="aw-nav-btn"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: mini ? 'center' : 'space-between',
                      gap: 8,
                      width: '100%',
                      minHeight: 40,
                      padding: mini ? 0 : '0 10px',
                      whiteSpace: 'nowrap',
                      borderRadius: 8,
                      background: current ? 'rgba(245,242,234,0.14)' : 'transparent',
                      color: '#F5F2EA',
                      fontSize: 13.5,
                      textDecoration: 'none',
                      transition: 'background 150ms',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name={it.icon} size={18} />
                      {!mini && <span>{it.label}</span>}
                    </span>
                    {!mini && it.badge > 0 && (
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 11,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: badgeBg,
                          color: '#00003A',
                        }}
                      >
                        {it.badge}
                      </span>
                    )}
                    {mini && it.badge > 0 && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 7,
                          right: 12,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: badgeBg,
                          boxShadow: '0 0 0 2px var(--side)',
                        }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <UserMenu me={me} mini={mini} stats={p.stats} quick={p.quick} onQuick={runQuick} onSignOut={signOut} />
      </aside>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px max(var(--admin-pad), calc((100% - 1440px) / 2 + var(--admin-pad)))',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <button
            type="button"
            onClick={() => setSide(true)}
            aria-label="Open navigation"
            style={{
              display: 'var(--mflex)',
              width: 40,
              height: 40,
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--panel)',
              color: 'var(--ink)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="menu" size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            style={{
              flex: 1,
              maxWidth: 460,
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--mute)',
              fontSize: 13,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={16} />
              Search bookings, guests, screens…
            </span>
            <span
              style={{
                display: 'var(--dflex)',
                fontFamily: mono,
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 5,
                border: '1px solid var(--line2)',
              }}
            >
              ⌘K
            </span>
          </button>
          <div style={{ flex: 1 }} />
          <a
            href="/"
            target="_blank"
            rel="noopener"
            data-tip="Open the public website in a new tab"
            style={{
              display: 'var(--dflex)',
              alignItems: 'center',
              gap: 6,
              height: 40,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--panel)',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            <Icon name="external" size={15} />
            View site
          </a>
          <button
            type="button"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            data-tip={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="aw-press"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--panel)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={18} />
          </button>
        </header>
        <main
          id="main"
          style={{
            padding: '24px var(--admin-pad) 80px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            minWidth: 0,
            width: '100%',
            maxWidth: 1440,
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {p.children}
        </main>
      </div>

      {palette && (
        <Palette
          groups={p.groups}
          dark={dark}
          onClose={() => setPalette(false)}
          onNewBooking={newBooking}
          onToggleDark={toggleDark}
          onSignOut={signOut}
        />
      )}
      <DrawerHost />
      <ModalHost />
      <TooltipHost />
      <Toaster
        position="bottom-right"
        visibleToasts={3}
        offset={20}
        mobileOffset={{ bottom: 20, right: 16 }}
        toastOptions={{ unstyled: true }}
      />
    </div>
  );
}

function Mark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="26"
      height="26"
      fill="none"
      stroke="#F5F2EA"
      strokeWidth="1.5"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="5.5" />
      <circle cx="21" cy="11" r="5.5" />
      <circle cx="11" cy="21" r="5.5" />
      <circle cx="21" cy="21" r="5.5" />
      <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
    </svg>
  );
}

/** "Desk open · 10:34 GMT" (Accra is on GMT all year). */
function DeskClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{
        margin: '0 8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: mono,
        fontSize: 11,
        color: 'rgba(245,242,234,0.7)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#F2B544',
          display: 'inline-block',
          animation: 'aw-breathe 2.8s ease-in-out infinite',
        }}
      />
      Desk open · {now ?? '--:--'} GMT
    </div>
  );
}

const QUICK: Record<QuickKey, { icon: AnyIconName; label: string }> = {
  newBooking: { icon: 'bed', label: 'New booking' },
  newRental: { icon: 'pkg', label: 'New rental' },
  blockDates: { icon: 'calendar', label: 'Block dates' },
  addItem: { icon: 'box', label: 'Add rental item' },
};

function UserMenu(p: { me: Me; mini: boolean; stats: UmStat[]; quick: QuickKey[]; onQuick: (k: QuickKey) => void; onSignOut: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<false | 'click' | 'hover'>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = useCallback((focusBtn: boolean) => {
    clearTimeout(timer.current);
    setOpen(false);
    if (focusBtn) ref.current?.querySelector('button')?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', out, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', out, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open, close]);
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const hoverable = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  const item: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: 'var(--ink)',
    textAlign: 'left',
    transition: 'background 120ms',
  };

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        if (!hoverable()) return;
        clearTimeout(timer.current);
        if (!open) timer.current = setTimeout(() => setOpen('hover'), 220);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        if (open === 'hover') timer.current = setTimeout(() => close(false), 320);
      }}
      style={{ position: 'relative', marginTop: 12 }}
    >
      <button
        type="button"
        onClick={(e) => {
          clearTimeout(timer.current);
          if (open === 'click') return close(false);
          const kb = e.detail === 0;
          setOpen('click');
          if (kb) setTimeout(() => ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true }), 30);
        }}
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-label={`Account menu for ${p.me.name}`}
        data-tip={p.mini && !open ? p.me.name : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: p.mini ? 'center' : 'space-between',
          gap: 10,
          padding: p.mini ? 6 : '10px 12px',
          border: 'none',
          borderRadius: 10,
          background: open ? 'rgba(245,242,234,0.12)' : 'rgba(245,242,234,0.06)',
          color: '#F5F2EA',
          textAlign: 'left',
          transition: 'background 150ms',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: '50%',
            background: '#E3E4F5',
            color: '#000063',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {p.me.initials}
        </span>
        {!p.mini && (
          <>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.me.name}</span>
              <span style={{ fontSize: 11.5, color: 'rgba(245,242,234,0.65)', whiteSpace: 'nowrap' }}>{p.me.roleLabel}</span>
            </span>
            <Icon name="chevupdown" size={15} style={{ opacity: 0.7 }} />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^=menuitem]'));
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              (items[i + 1] ?? items[0])?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              (items[i - 1] ?? items[items.length - 1])?.focus();
            } else if (e.key === 'Home') {
              e.preventDefault();
              items[0]?.focus();
            } else if (e.key === 'End') {
              e.preventDefault();
              items[items.length - 1]?.focus();
            } else if (e.key === 'Tab') close(false);
          }}
          className="aw-um"
          style={{
            position: 'absolute',
            overflow: 'hidden',
            background: 'var(--panel)',
            color: 'var(--ink)',
            border: '1px solid var(--line2)',
            borderRadius: 14,
            boxShadow: '0 24px 48px -16px rgba(0,0,0,0.45)',
            zIndex: 70,
            display: 'flex',
            flexDirection: 'column',
            animation: `aw-pop 180ms ${EASE}`,
            transformOrigin: '0 100%',
            left: 0,
            right: 0,
            bottom: 'calc(100% + 8px)',
            ...({ '--um-left': p.mini ? 'calc(100% + 18px)' : 'calc(100% + 22px)' } as React.CSSProperties),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', minWidth: 0 }}>
            <span
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: '50%',
                background: 'var(--pri-bg)',
                color: 'var(--pri-fg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {p.me.initials}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.me.name}
              </span>
              <span
                title={p.me.email}
                style={{ fontSize: 12.5, color: 'var(--mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {p.me.email}
              </span>
              <span
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 3,
                  padding: '1px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  background: 'var(--chip-bg)',
                  color: 'var(--chip-fg)',
                }}
              >
                {p.me.roleShort}
              </span>
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
              borderTop: '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            {p.stats.map((st) => (
              <button
                key={st.label}
                type="button"
                role="menuitem"
                className="aw-hov"
                onClick={() => run(() => router.push(st.href))}
                style={{
                  ...item,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  padding: '9px 4px',
                  borderRight: '1px solid var(--line)',
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 500, color: st.n ? 'var(--amber-ink)' : 'var(--ink)' }}>
                  {st.n}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--mute)', textAlign: 'center', lineHeight: 1.25 }}>{st.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 10px 8px' }}>
            {p.quick.map((k) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                className="aw-hov"
                onClick={() => run(() => p.onQuick(k))}
                style={{
                  ...item,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 40,
                  padding: '0 10px',
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name={QUICK[k].icon} size={16} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{QUICK[k].label}</span>
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {[
              { icon: 'external' as const, label: 'View website', hint: 'New tab', on: () => window.open('/', '_blank', 'noopener') },
              { icon: 'user' as const, label: 'My account', hint: 'Email, password', on: () => router.push('/admin/account') },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                role="menuitem"
                className="aw-hov"
                onClick={() => run(q.on)}
                style={{
                  ...item,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  minHeight: 40,
                  padding: '0 16px',
                  fontSize: 14,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name={q.icon} size={17} />
                  {q.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{q.hint}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', padding: '4px 0 6px', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              role="menuitem"
              className="aw-hov"
              onClick={() => run(p.onSignOut)}
              style={{
                ...item,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 40,
                padding: '0 16px',
                color: 'var(--red)',
                fontSize: 14,
              }}
            >
              <Icon name="logout" size={17} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
