import { describe, expect, it } from 'vitest';
import { placeTip } from '@/components/admin/tooltip';

const rect = (left: number, top: number, width = 40, height = 40) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const inside = (p: { left: number; top: number }, w: number, h: number, vw: number, vh: number) =>
  p.left >= 8 && p.top >= 8 && p.left + w <= vw - 8 && p.top + h <= vh - 8;

describe('tooltip placement', () => {
  it('goes to the right of a collapsed sidebar icon, vertically centred', () => {
    const p = placeTip(rect(20, 400), 140, 28, 1280, 800, 'right');
    expect(p).toEqual({ left: 68, top: 406 });
  });

  it('never leaves the window, whatever the anchor or size', () => {
    const vws = [320, 390, 768, 1280];
    for (const vw of vws)
      for (const x of [0, 4, vw / 2, vw - 44, vw - 4])
        for (const y of [0, 20, 300, 760])
          for (const side of ['auto', 'right'] as const) {
            const p = placeTip(rect(x, y), 220, 40, vw, 800, side);
            expect(inside(p, 220, 40, vw, 800), `${vw} ${x} ${y} ${side}`).toBe(true);
          }
  });

  it('sits above when there is room, below near the top', () => {
    expect(placeTip(rect(600, 300), 100, 30, 1280, 800, 'auto').top).toBe(262);
    expect(placeTip(rect(600, 10), 100, 30, 1280, 800, 'auto').top).toBe(58);
  });

  it('falls back to above or below when there is no room on the right', () => {
    const p = placeTip(rect(1200, 400), 200, 30, 1280, 800, 'right');
    expect(p.top).toBe(362);
    expect(p.left).toBe(1072);
  });
});
