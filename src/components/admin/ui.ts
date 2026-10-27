// Shared look for the admin, ported from Admin.dc.html: status chips, buttons,
// and the status → tone map. Colours come from the .admin tokens (light/dark).
import type { CSSProperties } from 'react';
import type { AnyIconName } from '@/components/ui/icon';

export const EASE = 'cubic-bezier(0.23,1,0.32,1)';
export const mono = 'var(--font-mono)';
export const serif = 'var(--font-serif)';

export type Tone = 'amber' | 'mid' | 'solid' | 'green' | 'red' | 'grey';

const TONES: Record<Tone, [string, string]> = {
  amber: ['rgba(242,181,68,0.22)', 'var(--amber-ink)'],
  mid: ['var(--chip-bg)', 'var(--chip-fg)'],
  solid: ['var(--pri-bg)', 'var(--pri-fg)'],
  green: ['var(--green-bg)', 'var(--green)'],
  red: ['var(--red-bg)', 'var(--red)'],
  grey: ['var(--line)', 'var(--mute)'],
};

export function chip(tone: Tone): CSSProperties {
  const [bg, fg] = TONES[tone] ?? TONES.grey;
  return {
    display: 'inline-block',
    alignSelf: 'flex-start',
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    background: bg,
    color: fg,
  };
}

const STATUS_TONE: Record<string, Tone> = {
  'Pending payment': 'amber',
  Confirmed: 'mid',
  'Checked-in': 'solid',
  'Checked-out': 'grey',
  Cancelled: 'red',
  'No-show': 'red',
  Reserved: 'mid',
  'Ready for pickup': 'amber',
  Collected: 'solid',
  Returned: 'mid',
  Completed: 'grey',
  New: 'amber',
  Assigned: 'mid',
  Replied: 'green',
  Closed: 'grey',
  Paid: 'green',
  Refunded: 'green',
  Processing: 'mid',
  Rejected: 'red',
  Failed: 'red',
  'Pending approval': 'amber',
  Active: 'green',
  Paused: 'grey',
  Invited: 'amber',
  Deactivated: 'grey',
  Available: 'green',
  Occupied: 'solid',
  Cleaning: 'amber',
  Maintenance: 'red',
  'Out of order': 'red',
  Live: 'green',
  Draft: 'grey',
  Quoted: 'mid',
  'Deposit paid': 'solid',
  Done: 'grey',
  Lost: 'grey',
  Repeat: 'amber',
  Success: 'green',
  Expired: 'grey',
};

export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? 'grey';

export type BtnKind = 'ghost' | 'primary' | 'danger';

/** An action button: label doubles as the tooltip; iconOnly hides the label. */
export type Action = {
  label: string;
  on: () => void;
  kind?: BtnKind;
  icon?: AnyIconName;
  iconOnly?: boolean;
  hint?: string;
  disabled?: boolean;
};

export function btnColors(kind: BtnKind = 'ghost') {
  return {
    borderColor: kind === 'danger' ? 'var(--red)' : kind === 'primary' ? 'var(--pri-bg)' : 'var(--line2)',
    background: kind === 'primary' ? 'var(--pri-bg)' : 'transparent',
    color: kind === 'danger' ? 'var(--red)' : kind === 'primary' ? 'var(--pri-fg)' : 'var(--ink)',
  };
}

export const panel: CSSProperties = {
  borderRadius: 12,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
};
