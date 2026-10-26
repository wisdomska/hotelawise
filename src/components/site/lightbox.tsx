'use client';
// Full-screen photo viewer (Website.dc.html › lightbox): arrows, swipe, Escape.
import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { useScrollLock } from '@/components/ui/use-scroll-lock';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { SiteImage } from './site-image';

const glass: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.1)',
  WebkitBackdropFilter: 'blur(12px)',
  backdropFilter: 'blur(12px)',
  color: '#F5F2EA',
  fontSize: 18,
};

export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: SiteImageT[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const downX = useRef<number | null>(null);
  const step = (d: number) => onIndex((index + d + images.length) % images.length);
  const image = images[index]!;
  useScrollLock(true);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndex, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,30,0.6)',
        WebkitBackdropFilter: 'blur(24px)',
        backdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '56px 16px 24px',
        gap: 14,
        animation: 'aw-fade 200ms var(--ease-enter)',
      }}
    >
      <div
        key={image.id}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          downX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const dx = e.clientX - (downX.current ?? e.clientX);
          if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        }}
        style={{
          position: 'relative',
          width: 'min(1200px, 100%)',
          height: '78%',
          touchAction: 'pan-y',
          userSelect: 'none',
          animation: 'aw-pop 260ms var(--ease-enter)',
        }}
      >
        <SiteImage image={image} fill sizes="100vw" grade={false} draggable={false} style={{ objectFit: 'contain', borderRadius: 2 }} />
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#F5F2EA' }}>
        <button type="button" onClick={() => step(-1)} aria-label="Previous photo" style={glass}>
          ←
        </button>
        <span aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 220, textAlign: 'center' }}>
          {index + 1} / {images.length} · {image.alt}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next photo" style={glass}>
          →
        </button>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        style={{
          ...glass,
          position: 'absolute',
          top: 14,
          right: 14,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
