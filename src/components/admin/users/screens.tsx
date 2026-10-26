'use client';
// Users & permissions, Audit log and My account from Admin.dc.html.
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { changeEmailAction, changeNameAction, changePasswordAction } from '@/app/admin/(app)/account/actions';
import { changeRoleAction, inviteAction, resetPasswordAction, setActiveAction, setGrantAction } from '@/app/admin/(app)/users/actions';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import type { ActionResult } from '@/lib/admin/result';
import type { Grant } from '@/server/auth/permissions';
import { useAdmin } from '../context';
import { useExportAction } from '../export';
import { ConfirmModal, FieldGrid, ModalFrame, Note, SelectField, TextField } from '../modal';
import { PageHeader, Switch, Tabs, useTab } from '../page-parts';
import { c, col, DataTable, type Row } from '../table';
import { mono, panel, type Action } from '../ui';
import { useAction } from '../use-action';

/* ── shared bits ── */

const ROLE_OPTS = ['Staff · Front desk', 'Staff · Events', 'Staff · Night desk', 'Staff', 'Super Admin'];
const PERMS: [Grant, string][] = [
  ['content', 'Content'],
  ['reports', 'Reports'],
  ['inventoryEdit', 'Edit inventory'],
  ['venueQuotes', 'Venue quotes'],
  ['exports', 'Exports'],
];

const hm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const day = (d: Date) => d.toISOString().slice(0, 10);

/** "Today 08:02", "Yesterday 18:20" or "12 Oct 09:15" in Accra time (UTC). */
export function when(iso: string | null, never = 'Never'): string {
  if (!iso) return never;
  const d = new Date(iso);
  const today = day(new Date());
  const yest = day(new Date(Date.now() - 864e5));
  const k = day(d);
  if (k === today) return `Today ${hm(d)}`;
  if (k === yest) return `Yesterday ${hm(d)}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${hm(d)}`;
}

function useSet<T extends Record<string, string>>(init: T) {
  const { run, busy, errors, setErrors } = useAction();
  const [f, setF] = useState(init);
  const set = (k: keyof T) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors({ ...errors, [k as string]: '' });
  };
  return { f, set, run, busy, errors };
}

/** Shows a one-time password once, with copy. */
function SecretModal({
  title,
  sub,
  email,
  password,
  emailed,
}: {
  title: string;
  sub: string;
  email: string;
  password: string;
  emailed: boolean;
}) {
  const { closeModal, toast } = useAdmin();
  return (
    <ModalFrame title={title} sub={sub} confirm="Done" onConfirm={closeModal} secondary={{ label: 'Close', on: closeModal }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>Temporary password for {email}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--bg)',
              fontFamily: mono,
              fontSize: 15,
              letterSpacing: '0.02em',
              userSelect: 'all',
            }}
          >
            {password}
          </code>
          <button
            type="button"
            className="aw-press"
            onClick={() => {
              void navigator.clipboard?.writeText(password).then(
                () => toast('Copied.'),
                () => toast('Couldn’t copy. Select it and copy by hand.'),
              );
            }}
            style={{
              height: 40,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            <Icon name="clipboard" size={16} />
            Copy
          </button>
        </div>
      </div>
      <Note>
        {emailed ? 'We emailed it to them as well. ' : 'Email isn’t set up yet, so share it with them in person or by phone. '}
        It’s shown only this once. They choose their own password when they first sign in.
      </Note>
    </ModalFrame>
  );
}

type Secret = { email: string; password: string; emailed: boolean };
const secretOf = (r: ActionResult): Secret | null => (r.ok && r.data && typeof r.data === 'object' ? (r.data as Secret) : null);

/* ── Users & permissions ── */

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  isSuper: boolean;
  twoFactor: boolean;
  status: 'Active' | 'Invited' | 'Deactivated';
  lastSignIn: string | null;
};
export type PermRow = { id: string; name: string; jobTitle: string; grants: Record<Grant, boolean> };
export type SignInRow = { id: string; who: string; email: string; at: string; device: string; ok: boolean; reason: string | null };

function InviteModal() {
  const { openModal } = useAdmin();
  const { f, set, run, busy, errors } = useSet({ name: '', email: '', role: 'Staff · Front desk' });
  return (
    <ModalFrame
      title="Invite a staff member"
      sub="They get a temporary password and choose their own when they first sign in. New staff start with front-desk access only."
      confirm="Send invite"
      busy={busy}
      onConfirm={async () => {
        const r = await run(() => inviteAction(f));
        const s = secretOf(r);
        if (s) openModal(<SecretModal title="Invite created" sub={`${f.name.trim()} can sign in now.`} {...s} />);
      }}
    >
      <FieldGrid>
        <TextField label="Full name" value={f.name} onChange={set('name')} err={errors.name} autoComplete="off" />
        <TextField
          label="Work email"
          type="email"
          value={f.email}
          onChange={set('email')}
          err={errors.email}
          placeholder="name@hotelawise.com"
        />
        <SelectField label="Role" value={f.role} onChange={set('role')} options={ROLE_OPTS} err={errors.role} wide />
      </FieldGrid>
    </ModalFrame>
  );
}

function RoleModal({ u }: { u: TeamRow }) {
  const { f, set, run, busy, errors } = useSet({ role: ROLE_OPTS.includes(u.roleLabel) ? u.roleLabel : 'Staff' });
  return (
    <ModalFrame
      title={`Change ${u.name.split(' ')[0]}’s role`}
      sub="Super Admins can do everything. Staff get front-desk access plus any permissions you turn on."
      confirm="Save role"
      busy={busy}
      onConfirm={() => run(() => changeRoleAction(u.id, f.role))}
    >
      <FieldGrid>
        <SelectField label="Role" value={f.role} onChange={set('role')} options={ROLE_OPTS} err={errors.role} wide />
      </FieldGrid>
    </ModalFrame>
  );
}

function ResetModal({ u }: { u: TeamRow }) {
  const { openModal } = useAdmin();
  const { run, busy } = useAction();
  return (
    <ModalFrame
      title={`Reset ${u.name.split(' ')[0]}’s password?`}
      sub="They’re signed out everywhere and get a temporary password to sign in with once."
      confirm="Reset password"
      danger
      busy={busy}
      onConfirm={async () => {
        const r = await run(() => resetPasswordAction(u.id));
        const s = secretOf(r);
        if (s) openModal(<SecretModal title="Password reset" sub={`${u.name} signs in with this once, then picks a new one.`} {...s} />);
      }}
    />
  );
}

export function UsersScreen({ meId, team, perms, signIns }: { meId: string; team: TeamRow[]; perms: PermRow[]; signIns: SignInRow[] }) {
  const { openModal } = useAdmin();
  const tabs = ['People', 'Permissions', 'Sign-in history'] as const;
  const [tab, setTab] = useTab(tabs, 'People');
  const supers = team.filter((u) => u.isSuper && u.status !== 'Deactivated').length;

  const people: Row[] = team.map((u) => {
    const first = u.name.split(' ')[0];
    const me = u.id === meId;
    const acts: Action[] = [];
    if (!me) {
      acts.push({ label: `Change ${first}’s role`, icon: 'edit', iconOnly: true, on: () => openModal(<RoleModal u={u} />) });
      acts.push({ label: `Reset ${first}’s password`, icon: 'key', iconOnly: true, on: () => openModal(<ResetModal u={u} />) });
      if (u.status === 'Deactivated')
        acts.push({
          label: `Reactivate ${u.name}`,
          icon: 'check',
          iconOnly: true,
          on: () =>
            openModal(
              <ConfirmModal
                title={`Reactivate ${u.name}?`}
                sub="They can sign in again with their password."
                confirm="Reactivate"
                run={() => setActiveAction(u.id, true)}
              />,
            ),
        });
      else if (!(u.isSuper && supers <= 1))
        acts.push({
          label: `Deactivate ${u.name}`,
          icon: 'ban',
          iconOnly: true,
          kind: 'danger',
          on: () =>
            openModal(
              <ConfirmModal
                title={`Deactivate ${u.name}?`}
                sub="They’re signed out everywhere straight away."
                confirm="Deactivate"
                run={() => setActiveAction(u.id, false)}
              />,
            ),
        });
    }
    return {
      key: u.id,
      cells: [
        c(me ? `${u.name} (you)` : u.name, undefined, u.email),
        c(u.roleLabel),
        c(u.twoFactor ? 'On' : 'Off', 'chip', undefined, u.twoFactor ? 'green' : 'grey'),
        c(when(u.lastSignIn), 'mute'),
        c(u.status, 'chip'),
      ],
      actions: acts,
    };
  });

  return (
    <>
      <PageHeader
        title="Users & permissions"
        sub="There’s always at least one Super Admin."
        actions={[{ label: 'Invite staff', icon: 'plus', kind: 'primary', on: () => openModal(<InviteModal />) }]}
      />
      <Tabs list={tabs} cur={tab} set={setTab} label="Users" />
      {tab === 'People' && (
        <DataTable
          title="People"
          count={String(team.length)}
          minW={760}
          cols={[col('NAME'), col('ROLE'), col('2-STEP'), col('LAST SIGN-IN'), col('STATUS')]}
          rows={people}
          empty={{ icon: 'users', text: 'No one here yet' }}
        />
      )}
      {tab === 'Permissions' && <PermissionMatrix rows={perms} />}
      {tab === 'Sign-in history' && (
        <DataTable
          title="Sign-in history"
          count={`last ${signIns.length}`}
          minW={620}
          cols={[col('WHO'), col('WHEN'), col('DEVICE'), col('RESULT')]}
          rows={signIns.map((r) => ({
            key: r.id,
            cells: [
              c(r.who, undefined, r.who === 'Unknown' ? r.email : undefined),
              c(when(r.at), 'mono'),
              c(r.device, 'mute'),
              c(r.ok ? 'Success' : `Failed${r.reason ? ` (${r.reason})` : ''}`, 'chip', undefined, r.ok ? 'green' : 'red'),
            ],
          }))}
          empty={{ icon: 'lock', text: 'No sign-ins yet' }}
        />
      )}
    </>
  );
}

function PermissionMatrix({ rows }: { rows: PermRow[] }) {
  const { toast, refresh } = useAdmin();
  // Shown straight away while the change saves; cleared when the server data comes back.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const flip = async (u: PermRow, g: Grant) => {
    const k = `${u.id}:${g}`;
    const next = !(pending[k] ?? u.grants[g]);
    setPending((p) => ({ ...p, [k]: next }));
    try {
      const r = await setGrantAction(u.id, g, next);
      toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
      if (r.ok) refresh();
    } catch {
      toast('That didn’t work.', 'Check your connection and try again.');
    } finally {
      setPending((p) => {
        const { [k]: _gone, ...rest } = p;
        return rest;
      });
    }
  };
  return (
    <section style={{ ...panel, overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>What each staff member can do</h2>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>
          Changes apply straight away and are logged. Super Admins can do everything.
        </span>
      </div>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 400, color: 'var(--mute)', fontSize: 12 }}>
                  Staff member
                </th>
                {PERMS.map(([g, label]) => (
                  <th
                    key={g}
                    scope="col"
                    style={{ padding: '10px 8px', fontWeight: 400, color: 'var(--mute)', fontSize: 12, textAlign: 'center' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 16px' }}>
                    {u.name}
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--mute)' }}>{u.jobTitle || 'Staff'}</span>
                  </td>
                  {PERMS.map(([g, label]) => {
                    const k = `${u.id}:${g}`;
                    return (
                      <td key={g} style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex' }}>
                          <Switch
                            size="sm"
                            checked={pending[k] ?? u.grants[g]}
                            disabled={k in pending}
                            label={`${label} for ${u.name}`}
                            onChange={() => void flip(u, g)}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '36px 16px', textAlign: 'center', fontSize: 13.5, color: 'var(--mute)' }}>
          No active staff yet. Invite someone from the People tab.
        </div>
      )}
    </section>
  );
}

/* ── Audit log ── */

export type AuditEntry = { id: string; at: string; who: string; action: string; entity: string; target: string; change: string };
type Filters = { who: string; what: string; from: string; to: string };

const entityLabel = (e: string) => e.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());

function auditQuery(f: Filters, page?: number) {
  const q = new URLSearchParams();
  if (f.who) q.set('who', f.who);
  if (f.what) q.set('what', f.what);
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (page) q.set('p', String(page + 1));
  return q.toString();
}

export function AuditScreen(p: {
  rows: AuditEntry[];
  total: number;
  page: number;
  filters: Filters;
  whos: string[];
  whats: string[];
  canExport: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const exportAction = useExportAction();
  const go = (f: Filters) => {
    const q = auditQuery(f);
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  };
  const set = (k: keyof Filters) => (v: string) => go({ ...p.filters, [k]: v });
  const any = Object.values(p.filters).some(Boolean);
  return (
    <>
      <PageHeader
        title="Audit log"
        sub="Who changed what, and when."
        actions={
          p.canExport
            ? [
                exportAction(
                  p.total > 5000 ? 'the newest 5,000 audit entries' : 'the audit log',
                  `/admin/audit/export${auditQuery(p.filters) ? `?${auditQuery(p.filters)}` : ''}`,
                ),
              ]
            : []
        }
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          variant="compact"
          ariaLabel="Who"
          value={p.filters.who}
          onChange={set('who')}
          options={[{ value: '', label: 'Everyone' }, ...p.whos.map((w) => ({ value: w, label: w }))]}
          width={190}
        />
        <Select
          variant="compact"
          ariaLabel="What"
          value={p.filters.what}
          onChange={set('what')}
          options={[{ value: '', label: 'Everything' }, ...p.whats.map((w) => ({ value: w, label: entityLabel(w) }))]}
          width={170}
        />
        <div style={{ width: 160 }}>
          <DatePicker variant="field" compact label="From" value={p.filters.from} max={p.filters.to || undefined} onChange={set('from')} />
        </div>
        <div style={{ width: 160 }}>
          <DatePicker variant="field" compact label="To" value={p.filters.to} min={p.filters.from || undefined} onChange={set('to')} />
        </div>
        {any && (
          <button
            type="button"
            onClick={() => go({ who: '', what: '', from: '', to: '' })}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'transparent',
              fontSize: 12.5,
              color: 'var(--ink)',
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <DataTable
        title="Activity"
        count={`${p.total} ${p.total === 1 ? 'entry' : 'entries'}`}
        minW={860}
        cols={[col('WHEN'), col('WHO'), col('ACTION'), col('TARGET'), col('BEFORE → AFTER')]}
        rows={p.rows.map((a) => ({
          key: a.id,
          cells: [
            c(when(a.at), 'mono'),
            c(a.who),
            c(a.action, undefined, entityLabel(a.entity)),
            c(a.target, 'mono'),
            c(a.change || '—', 'wrap'),
          ],
        }))}
        pager={{
          page: p.page,
          total: p.total,
          href: (n) => {
            const q = auditQuery(p.filters, n);
            return q ? `${path}?${q}` : path;
          },
        }}
        empty={{
          icon: 'file',
          text: any ? 'Nothing matches those filters' : 'Nothing logged yet',
          sub: any ? 'Try a wider date range.' : undefined,
        }}
      />
    </>
  );
}

/* ── My account ── */

export type AccountInfo = {
  name: string;
  email: string;
  roleLabel: string;
  isSuper: boolean;
  twoFactor: boolean;
  twoFactorRequired: boolean;
  passwordChanged: string | null;
  recent: { at: string; ok: boolean; device: string }[];
};

function NameModal({ name }: { name: string }) {
  const { f, set, run, busy, errors } = useSet({ name });
  return (
    <ModalFrame
      title="Change your name"
      sub="Shown in the sidebar and the audit log."
      confirm="Save"
      busy={busy}
      onConfirm={() => run(() => changeNameAction(f))}
    >
      <FieldGrid>
        <TextField label="Full name" value={f.name} onChange={set('name')} err={errors.name} autoComplete="name" wide />
      </FieldGrid>
    </ModalFrame>
  );
}

function EmailModal() {
  const { f, set, run, busy, errors } = useSet({ email: '', pw: '' });
  return (
    <ModalFrame
      title="Change your email"
      sub="You’ll use the new email to sign in. We’ll send a note to the old one."
      confirm="Save email"
      busy={busy}
      onConfirm={() => run(() => changeEmailAction(f))}
    >
      <FieldGrid>
        <TextField
          label="New email"
          type="email"
          value={f.email}
          onChange={set('email')}
          err={errors.email}
          placeholder="you@hotelawise.com"
          wide
        />
        <TextField label="Current password" type="password" value={f.pw} onChange={set('pw')} err={errors.pw} wide />
      </FieldGrid>
    </ModalFrame>
  );
}

function PasswordModal() {
  const { f, set, run, busy, errors } = useSet({ pw: '', npw: '', npw2: '' });
  return (
    <ModalFrame
      title="Change your password"
      sub="At least 8 characters, with letters and a number."
      confirm="Save password"
      busy={busy}
      onConfirm={() => run(() => changePasswordAction(f))}
    >
      <FieldGrid>
        <TextField label="Current password" type="password" value={f.pw} onChange={set('pw')} err={errors.pw} wide />
        <TextField label="New password" type="password" autoComplete="new-password" value={f.npw} onChange={set('npw')} err={errors.npw} />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={f.npw2}
          onChange={set('npw2')}
          err={errors.npw2}
        />
      </FieldGrid>
      <Note>Your other devices are signed out when it changes.</Note>
    </ModalFrame>
  );
}

export function AccountScreen({ a }: { a: AccountInfo }) {
  const { openModal } = useAdmin();
  const router = useRouter();
  const tfaSub = a.twoFactor
    ? 'An authenticator app code is asked for at sign-in'
    : a.twoFactorRequired && a.isSuper
      ? 'Required for Super Admins'
      : 'Optional. Adds a code from your phone at sign-in';
  const rows: Row[] = [
    {
      key: 'name',
      cells: [c('Name'), c(a.name)],
      actions: [{ label: 'Change name', icon: 'edit', on: () => openModal(<NameModal name={a.name} />) }],
    },
    {
      key: 'email',
      cells: [c('Email'), c(a.email, 'mono', 'You sign in with this')],
      actions: [{ label: 'Change email', icon: 'edit', on: () => openModal(<EmailModal />) }],
    },
    {
      key: 'pw',
      cells: [c('Password'), c('••••••••', 'mono', a.passwordChanged ? `Last changed ${when(a.passwordChanged)}` : 'Never changed')],
      actions: [{ label: 'Change password', icon: 'key', on: () => openModal(<PasswordModal />) }],
    },
    { key: 'role', cells: [c('Role'), c(a.roleLabel)], actions: [] },
    {
      key: 'tfa',
      cells: [c('Two-step sign-in'), c(a.twoFactor ? 'On' : 'Off', 'chip', tfaSub, a.twoFactor ? 'green' : 'grey')],
      actions: a.twoFactor ? [] : [{ label: 'Turn on', icon: 'lock', on: () => router.push('/admin/login?setup=enrol-2fa') }],
    },
  ];
  return (
    <>
      <PageHeader title="My account" sub="Your sign-in details. Only you can change them." />
      <DataTable title="Sign-in details" count="" minW={520} cols={[col('DETAIL'), col('CURRENT')]} rows={rows} />
      <DataTable
        title="Your recent sign-ins"
        count={a.recent.length ? `last ${a.recent.length}` : ''}
        minW={480}
        cols={[col('WHEN'), col('DEVICE'), col('RESULT')]}
        rows={a.recent.map((r, i) => ({
          key: String(i),
          cells: [c(when(r.at), 'mono'), c(r.device, 'mute'), c(r.ok ? 'Success' : 'Failed', 'chip', undefined, r.ok ? 'green' : 'red')],
        }))}
        empty={{ icon: 'lock', text: 'No sign-ins recorded yet' }}
      />
    </>
  );
}
