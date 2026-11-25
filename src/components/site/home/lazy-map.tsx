'use client';
// The "Getting here" map. Google's embed is about 2 MB of scripts, and the browser's own
// lazy loading still fetched it on page load, so the iframe is only added once the box is
// within about a screen of the viewport (D-60). Until then the box keeps its size and colour.
import { useEffect, useRef, useState } from 'react';

export function LazyMap({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} style={{ minHeight: 380, height: '100%', borderRadius: 16, overflow: 'hidden', background: '#F6E2B3' }}>
      {show && (
        <iframe
          title={title}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ width: '100%', height: '100%', minHeight: 380, border: 0, filter: 'grayscale(0.6) contrast(1.05)', display: 'block' }}
        />
      )}
    </div>
  );
}
