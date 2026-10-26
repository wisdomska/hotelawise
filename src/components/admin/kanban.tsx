'use client';
// Lanes of cards (rental order board, venue pipeline) from Admin.dc.html.
import { ActionButton } from './table';
import { EASE, mono, type Action } from './ui';

export type KanbanCard = { key: string; ref: string; when: string; title: string; sub: string; onOpen: () => void; actions: Action[] };
export type Lane = { title: string; cards: KanbanCard[] };

export function Kanban({ lanes, minCol = 230 }: { lanes: Lane[]; minCol?: number }) {
  return (
    <div
      data-stagger=""
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${lanes.length}, minmax(${minCol}px,1fr))`,
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 4,
      }}
    >
      {lanes.map((lane) => (
        <section
          key={lane.title}
          aria-label={lane.title}
          style={{
            minWidth: minCol,
            padding: 10,
            borderRadius: 12,
            background: 'var(--lane)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '2px 4px', minHeight: 22 }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 12.5,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {lane.title}
            </h2>
            <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>{lane.cards.length}</span>
          </div>
          {lane.cards.map((cd) => (
            <div
              key={cd.key}
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                animation: `aw-pop 220ms ${EASE}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  onClick={cd.onOpen}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    fontFamily: mono,
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  {cd.ref}
                </button>
                <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>{cd.when}</span>
              </div>
              <span style={{ fontSize: 13.5 }}>{cd.title}</span>
              <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--mute)' }}>{cd.sub}</span>
              {cd.actions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  {cd.actions.map((a) => (
                    <ActionButton key={a.label} a={a} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {lane.cards.length === 0 && (
            <span
              style={{
                padding: '16px 6px',
                fontSize: 12,
                color: 'var(--mute)',
                textAlign: 'center',
                border: '1px dashed var(--line2)',
                borderRadius: 8,
              }}
            >
              Nothing here
            </span>
          )}
        </section>
      ))}
    </div>
  );
}
