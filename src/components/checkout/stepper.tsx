// The step indicator for booking and rentals checkout: numbered circles joined by a line.
// Done steps show a tick and a filled line, the current one is filled navy with a ring,
// upcoming ones are outlined. Labels sit under the circles and hide on narrow phones,
// where the current step's name is shown on its own.
import { Icon } from '@/components/ui/icon';

// Colours come from --step-* variables when a host sets them (the admin modal does, so the
// stepper follows its light and dark themes); otherwise the site's navy and cream.
const ON = 'var(--step-on, #000063)';
const ON_FG = 'var(--step-on-fg, #F5F2EA)';
const INK = 'var(--step-ink, #00003A)';
const MUTE = 'var(--step-mute, rgba(0,0,58,0.6))';
const LINE = 'var(--step-line, rgba(0,0,99,0.16))';
const EDGE = 'var(--step-edge, rgba(0,0,99,0.3))';
const RING = 'var(--step-ring, rgba(0,0,99,0.14))';

export function Stepper({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <nav aria-label={label} style={{ width: '100%' }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((name, i) => {
          const n = i + 1;
          const done = n < current;
          const now = n === current;
          return (
            <li
              key={name}
              aria-current={now ? 'step' : undefined}
              style={{ flex: i === steps.length - 1 ? '0 0 auto' : '1 1 0', display: 'flex', alignItems: 'flex-start', minWidth: 0 }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 500,
                    background: done || now ? ON : 'transparent',
                    color: done || now ? ON_FG : MUTE,
                    border: `1.5px solid ${done || now ? ON : EDGE}`,
                    boxShadow: now ? `0 0 0 4px ${RING}` : 'none',
                    transition: 'background 200ms, box-shadow 200ms',
                  }}
                >
                  {done ? <Icon name="check" size={15} /> : n}
                  <span className="sr-only">{done ? ' (done)' : now ? ' (current step)' : ''}</span>
                </span>
                <span
                  className={now ? undefined : 'hidden tab:block'}
                  style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: now ? INK : MUTE, fontWeight: now ? 500 : 400 }}
                >
                  {name}
                </span>
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: 2,
                    margin: '15px 10px 0',
                    borderRadius: 1,
                    background: done ? ON : LINE,
                    transition: 'background 200ms',
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
