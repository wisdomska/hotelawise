'use client';
// Inbox (Admin.dc.html screen "inbox"): the message list on the left, the
// open message with its replies, assignee and status on the right.
import { useState } from 'react';
import { assignAction, messageStatusAction, replyAction } from '@/app/admin/(app)/inbox/actions';
import { Icon } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import { MESSAGE_STATUS } from '@/lib/admin/labels';
import type { ActionResult } from '@/lib/admin/result';
import { telHref, whatsappHref } from '@/lib/phone';
import type { InboxMessage, MessageStatus } from '@/server/admin/inbox';
import { useAdmin } from '../context';
import { PageHeader } from '../page-parts';
import { ActionButton } from '../table';
import { chip, mono, statusTone } from '../ui';
import { useAction } from '../use-action';

type Props = { messages: InboxMessage[]; people: { id: string; name: string; job: string }[] };

function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Accra' });
}

const STATUS_OPTS = (Object.keys(MESSAGE_STATUS) as MessageStatus[]).map((k) => ({ value: k, label: MESSAGE_STATUS[k] }));

export function InboxScreen({ messages, people }: Props) {
  const { can, toast, refresh } = useAdmin();
  const [selId, setSelId] = useState<string | null>(messages[0]?.id ?? null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { run, busy, errors, setErrors } = useAction();
  const msg = messages.find((m) => m.id === selId) ?? messages[0];
  const manage = can('inbox.manage');
  const fresh = messages.filter((m) => m.status === 'new').length;

  const quick = async (fn: () => Promise<ActionResult>) => {
    const r: ActionResult = await fn().catch(() => ({ ok: false, error: 'That didn’t work. Check your connection.' }));
    if (r.ok) {
      toast(r.title, r.body);
      refresh();
    } else toast(r.error);
  };

  const header = (
    <PageHeader
      title="Inbox"
      sub={fresh ? `Messages from the website contact form. ${fresh} new.` : 'Messages from the website contact form.'}
    />
  );
  if (!msg)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {header}
        <div
          style={{
            padding: '56px 24px',
            border: '1px dashed var(--line2)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            textAlign: 'center',
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--chip-bg)',
              color: 'var(--chip-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="inbox" size={20} />
          </span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Inbox zero</span>
          <span style={{ fontSize: 13, color: 'var(--mute)' }}>Messages from the website contact form land here.</span>
        </div>
      </div>
    );

  const reply = replies[msg.id] ?? '';
  const setReply = (v: string) => {
    setReplies((x) => ({ ...x, [msg.id]: v }));
    if (errors.reply) setErrors({});
  };
  const assignOpts = [{ value: '', label: 'Unassigned' }, ...people.map((u) => ({ value: u.id, label: u.name, sub: u.job || undefined }))];
  const thread = [
    { key: 'in', who: msg.from, at: msg.at, text: msg.body, mine: false, via: '' },
    ...msg.replies.map((r, i) => ({
      key: String(i),
      who: r.by,
      at: r.at,
      text: r.body,
      mine: true,
      via: r.channel === 'email' ? 'Email' : r.channel === 'sms' ? 'SMS' : 'Note',
    })),
  ];
  const sendHint = msg.email
    ? `Goes to ${msg.email} by email`
    : msg.phone
      ? `Goes to ${msg.contact} by SMS`
      : 'No email or phone to reply to';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {header}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--c-inbox)',
          borderRadius: 12,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          overflow: 'hidden',
          minHeight: 520,
        }}
      >
        <div
          role="list"
          aria-label="Messages"
          style={{
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            maxHeight: 720,
            overflowY: 'auto',
          }}
        >
          {messages.map((m) => {
            const cur = m.id === msg.id;
            return (
              <button
                key={m.id}
                type="button"
                role="listitem"
                aria-current={cur ? 'true' : undefined}
                onClick={() => setSelId(m.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '12px 14px',
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  boxShadow: cur ? 'inset 3px 0 0 var(--ink)' : 'none',
                  background: cur ? 'var(--hover)' : 'transparent',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  minWidth: 0,
                  flexShrink: 0,
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: m.status === 'new' ? 600 : 400,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.from}
                  </span>
                  <span
                    suppressHydrationWarning
                    style={{ flexShrink: 0, fontFamily: mono, fontSize: 11, color: 'var(--mute)', whiteSpace: 'nowrap' }}
                  >
                    {relTime(m.at)}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                  <span style={chip(statusTone(MESSAGE_STATUS[m.status]))}>{MESSAGE_STATUS[m.status]}</span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: 'var(--mute)',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.subject}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.body}
                </span>
              </button>
            );
          })}
        </div>
        <section
          aria-label={`Message from ${msg.from}`}
          style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{msg.from}</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--mute)', overflowWrap: 'anywhere' }}>
                {msg.contact} · {msg.subject}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {msg.phone && (
                <>
                  <ActionButton
                    a={{ label: `Call ${msg.from}`, icon: 'phone', iconOnly: true, on: () => (location.href = telHref(msg.phone!)) }}
                  />
                  <ActionButton
                    a={{
                      label: 'WhatsApp',
                      icon: 'whatsapp',
                      iconOnly: true,
                      on: () => window.open(whatsappHref(msg.phone!), '_blank', 'noopener'),
                    }}
                  />
                </>
              )}
              {manage && (
                <>
                  <Select
                    variant="compact"
                    ariaLabel="Assign to"
                    value={msg.assigneeId ?? ''}
                    options={assignOpts}
                    width={170}
                    onChange={(v) => void quick(() => assignAction(msg.id, v || null))}
                  />
                  <Select
                    variant="compact"
                    ariaLabel="Status"
                    value={msg.status}
                    options={STATUS_OPTS}
                    width={130}
                    onChange={(v) => void quick(() => messageStatusAction(msg.id, v))}
                  />
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {thread.map((t) => (
              <div
                key={t.key}
                style={{
                  alignSelf: t.mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: t.mine ? 'var(--pri-bg)' : 'var(--hover)',
                  color: t.mine ? 'var(--pri-fg)' : 'var(--ink)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                <span suppressHydrationWarning style={{ display: 'block', fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>
                  {t.who} · {relTime(t.at)}
                  {t.via ? ` · ${t.via}` : ''}
                </span>
                {t.text}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {manage && (msg.email || msg.phone) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim() || busy) return;
                void run(() => replyAction(msg.id, reply), { close: false }).then((r) => {
                  if (r.ok) setReply('');
                });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--mute)' }}>
                Reply
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder={sendHint}
                  aria-invalid={errors.reply ? true : undefined}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${errors.reply ? 'var(--red)' : 'var(--line2)'}`,
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontSize: 14,
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
              </label>
              {errors.reply && (
                <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
                  {errors.reply}
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="submit"
                  disabled={!reply.trim() || busy}
                  className="aw-press"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 40,
                    padding: '0 16px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'var(--pri-bg)',
                    color: 'var(--pri-fg)',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: !reply.trim() || busy ? 0.5 : 1,
                  }}
                >
                  <Icon name="send" size={14} />
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
