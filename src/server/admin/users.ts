// Users & permissions: the team list, invites, roles, deactivation, password
// resets, the per-staff permission grants and sign-in history. There is always
// at least one active Super Admin, and nobody can lock themselves out.
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { isIsoDate } from '@/lib/dates';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { createPasswordHasher } from '@/server/auth/password';
import { GRANTS, type Grant, type Role } from '@/server/auth/permissions';
import { createUser } from '@/server/auth/users';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';

export const JOB_TITLES = ['Front desk', 'Events', 'Night desk'] as const;

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string;
  twoFactor: boolean;
  status: 'Active' | 'Invited' | 'Deactivated';
  lastSignIn: string | null;
};

export const roleLabel = (role: Role, jobTitle: string) =>
  role === 'super_admin' ? 'Super Admin' : jobTitle ? `Staff · ${jobTitle}` : 'Staff';

export async function team(db: AnyDb): Promise<TeamMember[]> {
  const rows = rowsOf<{
    id: string;
    name: string;
    email: string;
    role: Role;
    job_title: string;
    two_factor_enabled: boolean;
    banned: boolean;
    must_change_password: boolean;
    last: string | null;
  }>(
    await db.execute(sql`
      select u.id, u.name, u.email, u.role, u.job_title, u.two_factor_enabled, u.banned, u.must_change_password,
             to_json((select max(l.created_at) from login_events l where l.email = u.email and l.success))#>>'{}' as last
        from "user" u
       order by (u.role = 'super_admin') desc, u.banned, lower(u.name)`),
  );
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.job_title,
    twoFactor: u.two_factor_enabled,
    status: u.banned ? 'Deactivated' : u.must_change_password && !u.last ? 'Invited' : 'Active',
    lastSignIn: u.last ? new Date(u.last).toISOString() : null,
  }));
}

export type SignIn = { id: string; who: string; email: string; at: string; device: string; ok: boolean; reason: string | null };

/** "Chrome · Mac" from a user agent; enough to spot an unfamiliar device. */
export function deviceOf(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? /iPad/.test(ua)
      ? 'iPad'
      : 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

export async function signIns(db: AnyDb, limit = 80): Promise<SignIn[]> {
  const rows = rowsOf<{
    id: string;
    email: string;
    name: string | null;
    at: string;
    user_agent: string | null;
    success: boolean;
    reason: string | null;
  }>(
    await db.execute(sql`
      select l.id, l.email, u.name, to_json(l.created_at)#>>'{}' as at, l.user_agent, l.success, l.reason
        from login_events l
        left join "user" u on u.email = l.email
       order by l.created_at desc
       limit ${limit}`),
  );
  return rows.map((r) => ({
    id: r.id,
    who: r.name ?? 'Unknown',
    email: r.email,
    at: new Date(r.at).toISOString(),
    device: deviceOf(r.user_agent),
    ok: r.success,
    reason: r.reason,
  }));
}

export type PermRow = { id: string; name: string; jobTitle: string; grants: Record<Grant, boolean> };

export async function permissionMatrix(db: AnyDb): Promise<PermRow[]> {
  const staff = await db
    .select({ id: s.user.id, name: s.user.name, jobTitle: s.user.jobTitle })
    .from(s.user)
    .where(and(eq(s.user.role, 'staff'), eq(s.user.banned, false)))
    .orderBy(s.user.name);
  if (!staff.length) return [];
  const grants = await db
    .select()
    .from(s.userPermissions)
    .where(
      inArray(
        s.userPermissions.userId,
        staff.map((u) => u.id),
      ),
    );
  return staff.map((u) => ({
    ...u,
    grants: Object.fromEntries(GRANTS.map((g) => [g, grants.some((x) => x.userId === u.id && x.key === g && x.enabled)])) as Record<
      Grant,
      boolean
    >,
  }));
}

/** A readable one-time password: "Akwaaba-" and 8 letters/digits, always with a digit. */
export function temporaryPassword(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let tail = Array.from(bytes, (b) => abc[b % abc.length]).join('');
  if (!/\d/.test(tail)) tail = tail.slice(0, 7) + String(2 + (bytes[0]! % 8));
  return `Akwaaba-${tail}`;
}

async function member(db: AnyDb, id: string) {
  const [u] = await db.select().from(s.user).where(eq(s.user.id, id));
  if (!u) throw new AdminError('That person no longer has an account.');
  return u;
}

async function activeSupers(db: AnyDb, exceptId: string) {
  const [r] = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n from "user" where role = 'super_admin' and not banned and id <> ${exceptId}`),
  );
  return r?.n ?? 0;
}

export async function inviteUser(db: AnyDb, by: Who, input: { name: string; email: string; role: Role; jobTitle: string }) {
  const email = input.email.trim().toLowerCase();
  const [taken] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email));
  if (taken) throw new AdminError('That person already has an account.', { email: 'That person already has an account.' });
  const password = temporaryPassword();
  const id = await createUser(db, { name: input.name, email, role: input.role, temporaryPassword: password });
  const jobTitle = input.role === 'staff' ? input.jobTitle : '';
  if (jobTitle) await db.update(s.user).set({ jobTitle }).where(eq(s.user.id, id));
  await audit(db, {
    actor: by,
    action: 'Invited user',
    entity: 'user',
    entityId: id,
    target: email,
    after: { role: roleLabel(input.role, jobTitle) },
  });
  return { id, email, password };
}

export async function updateRole(db: AnyDb, by: Who, id: string, role: Role, jobTitle: string) {
  const u = await member(db, id);
  if (u.id === by.id && role !== u.role) throw new AdminError('You can’t change your own role. Ask another Super Admin.');
  if (u.role === 'super_admin' && role !== 'super_admin' && !u.banned && (await activeSupers(db, u.id)) === 0)
    throw new AdminError('There must always be at least one Super Admin.');
  const title = role === 'staff' ? jobTitle : '';
  await db.update(s.user).set({ role, jobTitle: title }).where(eq(s.user.id, id));
  await audit(db, {
    actor: by,
    action: 'Changed role',
    entity: 'user',
    entityId: id,
    target: u.name,
    before: { role: roleLabel(u.role, u.jobTitle) },
    after: { role: roleLabel(role, title) },
  });
  return { name: u.name, label: roleLabel(role, title) };
}

export async function setActive(db: AnyDb, by: Who, id: string, active: boolean) {
  const u = await member(db, id);
  if (!active && u.id === by.id) throw new AdminError('You can’t deactivate your own account.');
  if (!active && u.role === 'super_admin' && (await activeSupers(db, u.id)) === 0)
    throw new AdminError('There must always be at least one Super Admin.');
  if (u.banned === !active) return { name: u.name };
  await db
    .update(s.user)
    .set({ banned: !active, banReason: active ? null : `Deactivated by ${by.name}` })
    .where(eq(s.user.id, id));
  if (!active) await db.delete(s.session).where(eq(s.session.userId, id));
  await audit(db, {
    actor: by,
    action: active ? 'Reactivated user' : 'Deactivated user',
    entity: 'user',
    entityId: id,
    target: u.name,
    before: { status: active ? 'Deactivated' : 'Active' },
    after: { status: active ? 'Active' : 'Deactivated' },
  });
  return { name: u.name };
}

/** Sets a one-time password the person must change at their next sign-in, and signs them out everywhere. */
export async function resetPassword(db: AnyDb, by: Who, id: string) {
  const u = await member(db, id);
  if (u.id === by.id) throw new AdminError('Change your own password from My account.');
  const password = temporaryPassword();
  const hash = await createPasswordHasher(db).hash(password);
  const updated = await db
    .update(s.account)
    .set({ password: hash })
    .where(and(eq(s.account.userId, id), eq(s.account.providerId, 'credential')))
    .returning({ id: s.account.id });
  if (!updated.length) throw new AdminError('That account has no password sign-in.');
  await db.update(s.user).set({ mustChangePassword: true }).where(eq(s.user.id, id));
  await db.delete(s.session).where(eq(s.session.userId, id));
  await audit(db, { actor: by, action: 'Reset password', entity: 'user', entityId: id, target: u.email });
  return { name: u.name, email: u.email, password };
}

export async function setGrant(db: AnyDb, by: Who, id: string, key: Grant, enabled: boolean) {
  const u = await member(db, id);
  if (u.role !== 'staff') throw new AdminError('Super Admins can already do everything.');
  await db
    .insert(s.userPermissions)
    .values({ userId: id, key, enabled })
    .onConflictDoUpdate({ target: [s.userPermissions.userId, s.userPermissions.key], set: { enabled } });
  await audit(db, {
    actor: by,
    action: enabled ? 'Granted permission' : 'Removed permission',
    entity: 'user',
    entityId: id,
    target: u.name,
    before: { [key]: !enabled ? 'On' : 'Off' },
    after: { [key]: enabled ? 'On' : 'Off' },
  });
  return { name: u.name };
}

/* ── audit log ── */

export type AuditFilter = { who?: string; what?: string; from?: string; to?: string };
/** Filters from the URL, cleaned (shared by the screen and the CSV download). */
export function auditFilters(sp: Record<string, string | undefined>): Required<AuditFilter> {
  const day = (v?: string) => (v && isIsoDate(v) ? v : '');
  return { who: (sp.who ?? '').slice(0, 120), what: (sp.what ?? '').slice(0, 60), from: day(sp.from), to: day(sp.to) };
}

export type AuditRow = { id: string; at: string; who: string; action: string; entity: string; target: string; change: string };

export const AUDIT_PAGE = 8;

const LABEL: Record<string, string> = { paid: 'Paid', status: 'Status', role: 'Role' };
const show = (v: unknown): string =>
  v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
const keyLabel = (k: string) => LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** "Status: Confirmed → Checked-in; Paid: GHS 0 → GHS 300". */
export function describeChange(before: unknown, after: unknown): string {
  const b = before && typeof before === 'object' ? (before as Record<string, unknown>) : null;
  const a = after && typeof after === 'object' ? (after as Record<string, unknown>) : null;
  if (!b && !a) return before != null || after != null ? `${show(before)} → ${show(after)}` : '';
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  return keys
    .map((k) => {
      if (!b || !(k in b)) return `${keyLabel(k)}: ${show(a?.[k])}`;
      if (!a || !(k in a)) return `${keyLabel(k)}: ${show(b[k])} → removed`;
      return `${keyLabel(k)}: ${show(b[k])} → ${show(a[k])}`;
    })
    .join('; ');
}

function auditWhere(f: AuditFilter) {
  const parts = [sql`true`];
  if (f.who) parts.push(sql`a.actor_name = ${f.who}`);
  if (f.what) parts.push(sql`a.entity = ${f.what}`);
  // Days are Accra days; Accra is UTC all year.
  if (f.from) parts.push(sql`a.created_at >= ${f.from}::date`);
  if (f.to) parts.push(sql`a.created_at < (${f.to}::date + 1)`);
  return sql.join(parts, sql` and `);
}

type RawAudit = {
  id: string;
  at: string;
  actor_name: string;
  action: string;
  entity: string;
  target: string | null;
  before: unknown;
  after: unknown;
};

const toRow = (r: RawAudit): AuditRow => ({
  id: r.id,
  at: new Date(r.at).toISOString(),
  who: r.actor_name,
  action: r.action,
  entity: r.entity,
  target: r.target ?? '',
  change: describeChange(r.before, r.after),
});

export async function auditPage(db: AnyDb, f: AuditFilter, page: number) {
  const where = auditWhere(f);
  const [rows, [total], whos, whats] = await Promise.all([
    db.execute(sql`
      select a.id, to_json(a.created_at)#>>'{}' as at, a.actor_name, a.action, a.entity, a.target, a.before, a.after
        from audit_log a where ${where}
       order by a.created_at desc, a.id
       limit ${AUDIT_PAGE} offset ${page * AUDIT_PAGE}`),
    db.execute(sql`select count(*)::int as n from audit_log a where ${where}`).then((r) => rowsOf<{ n: number }>(r)),
    db.execute(sql`select distinct actor_name as v from audit_log order by 1`).then((r) => rowsOf<{ v: string }>(r).map((x) => x.v)),
    db.execute(sql`select distinct entity as v from audit_log order by 1`).then((r) => rowsOf<{ v: string }>(r).map((x) => x.v)),
  ]);
  return { rows: rowsOf<RawAudit>(rows).map(toRow), total: total?.n ?? 0, whos, whats };
}

/** Every matching entry, newest first, for the CSV download (capped so a Worker stays inside its limits). */
export async function auditExport(db: AnyDb, f: AuditFilter, cap = 5000) {
  const rows = await db.execute(sql`
    select a.id, to_json(a.created_at)#>>'{}' as at, a.actor_name, a.action, a.entity, a.target, a.before, a.after
      from audit_log a where ${auditWhere(f)}
     order by a.created_at desc limit ${cap}`);
  return rowsOf<RawAudit>(rows).map(toRow);
}

export function toCsv(rows: (string | number)[][]): string {
  // A leading = + - @ would run as a formula in a spreadsheet, so those cells get a quote prefix.
  const cell = (v: string | number) => {
    const t = String(v);
    const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/* ── my account ── */

export async function myAccount(db: AnyDb, id: string) {
  const [u] = await db
    .select({ name: s.user.name, email: s.user.email, role: s.user.role, jobTitle: s.user.jobTitle, twoFactor: s.user.twoFactorEnabled })
    .from(s.user)
    .where(eq(s.user.id, id));
  if (!u) return null;
  const [acc] = await db
    .select({ changed: s.account.updatedAt, created: s.account.createdAt })
    .from(s.account)
    .where(and(eq(s.account.userId, id), eq(s.account.providerId, 'credential')));
  const changed = acc && acc.changed.getTime() - acc.created.getTime() > 5000 ? acc.changed.toISOString() : null;
  return { ...u, roleLabel: roleLabel(u.role, u.jobTitle), passwordChanged: changed };
}

export async function changeMyName(db: AnyDb, by: Who, name: string) {
  const u = await member(db, by.id);
  await db.update(s.user).set({ name }).where(eq(s.user.id, by.id));
  await audit(db, {
    actor: { id: by.id, name },
    action: 'Changed name',
    entity: 'user',
    entityId: by.id,
    target: name,
    before: { name: u.name },
    after: { name },
  });
}

export async function changeMyEmail(db: AnyDb, by: Who, email: string) {
  const u = await member(db, by.id);
  const next = email.trim().toLowerCase();
  if (next === u.email) throw new AdminError('That’s already your email.', { email: 'That’s already your email.' });
  const [taken] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, next));
  if (taken) throw new AdminError('Someone else signs in with that email.', { email: 'Someone else signs in with that email.' });
  await db.update(s.user).set({ email: next }).where(eq(s.user.id, by.id));
  await audit(db, {
    actor: by,
    action: 'Changed sign-in email',
    entity: 'user',
    entityId: by.id,
    target: by.name,
    before: { email: u.email },
    after: { email: next },
  });
  return { old: u.email, next };
}

/** New password for the signed-in user; their other sessions are signed out. */
export async function changeMyPassword(db: AnyDb, by: Who, password: string, keepSessionId: string | null) {
  const hash = await createPasswordHasher(db).hash(password);
  await db
    .update(s.account)
    .set({ password: hash })
    .where(and(eq(s.account.userId, by.id), eq(s.account.providerId, 'credential')));
  await db.update(s.user).set({ mustChangePassword: false }).where(eq(s.user.id, by.id));
  await db.execute(sql`delete from session where user_id = ${by.id} and id is distinct from ${keepSessionId}`);
  await audit(db, { actor: by, action: 'Changed password', entity: 'user', entityId: by.id, target: by.name });
}

export async function recentForUser(db: AnyDb, id: string, limit = 5) {
  const u = await member(db, id);
  return (await db.select().from(s.loginEvents).where(eq(s.loginEvents.email, u.email)).orderBy(desc(s.loginEvents.at)).limit(limit)).map(
    (r) => ({ at: r.at.toISOString(), ok: r.success, device: deviceOf(r.userAgent) }),
  );
}
