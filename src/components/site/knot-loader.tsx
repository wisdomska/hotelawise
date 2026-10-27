// "Turning the key…" (prototype first-load loader). Shown only on the first page
// view of a session: an inline script marks <html> before paint, and CSS fades
// the overlay out by 650 ms (DECISIONS D-34). Decorative, so hidden from AT.
export function KnotLoader() {
  return (
    <div
      className="aw-boot"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#00003A',
        color: '#F5F2EA',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width="56"
        height="56"
        fill="none"
        stroke="#F2B544"
        strokeWidth="1.2"
        style={{ animation: 'aw-spin 2.4s cubic-bezier(0.77,0,0.175,1) infinite' }}
      >
        <circle cx="11" cy="11" r="5.5" />
        <circle cx="21" cy="11" r="5.5" />
        <circle cx="11" cy="21" r="5.5" />
        <circle cx="21" cy="21" r="5.5" />
        <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
      </svg>
      <span style={{ opacity: 0.7 }}>Turning the key…</span>
    </div>
  );
}

/** Runs before first paint: marks the first page view of the session. */
/** Also hides the announcement banner if it was dismissed earlier this session. */
export const FIRST_VISIT_SCRIPT = `try{var d=document.documentElement,s=sessionStorage;if(!s.getItem('aw.booted')){d.setAttribute('data-first-visit','');s.setItem('aw.booted','1')}if(s.getItem('aw.bannerOff')==='1')d.setAttribute('data-banner-off','')}catch(e){}`;
