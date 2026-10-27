// The permission matrix from docs/PLAN.md §5. The server checks it in every
// action and query (requirePermission), and the sidebar, ⌘K palette and
// components render from the same map, so what Staff can't use is hidden.
export const ROLES = ['super_admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const GRANTS = ['content', 'reports', 'inventoryEdit', 'venueQuotes', 'exports'] as const;
export type Grant = (typeof GRANTS)[number];

export const CAPABILITIES = [
  'dashboard.view',
  'dashboard.revenue',
  'bookings.view',
  'bookings.create',
  'bookings.edit',
  'bookings.checkin',
  'bookings.checkout',
  'bookings.payment.desk',
  'bookings.note',
  'bookings.refund.request',
  'bookings.refund',
  'bookings.delete',
  'refunds.approve',
  'rooms.view',
  'rooms.status',
  'rooms.edit',
  'rentals.view',
  'rentals.create',
  'rentals.status',
  'rentals.checklist',
  'rentals.payment.desk',
  'rentals.refund',
  'rentals.delete',
  'inventory.view',
  'inventory.repair',
  'inventory.edit',
  'venues.view',
  'venues.pipeline',
  'venues.quote',
  'payments.view',
  'payments.manage',
  'customers.view',
  'customers.note',
  'customers.spend',
  'reports.view',
  'exports.download',
  'content.edit',
  'content.delete',
  'inbox.view',
  'inbox.manage',
  'settings.view',
  'settings.edit',
  'settings.keys.reveal',
  'users.view',
  'users.manage',
  'audit.view',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Everything Staff can do without any grant. */
const STAFF_BASE: ReadonlySet<Capability> = new Set<Capability>([
  'dashboard.view',
  'bookings.view',
  'bookings.create',
  'bookings.edit',
  'bookings.checkin',
  'bookings.checkout',
  'bookings.payment.desk',
  'bookings.note',
  'bookings.refund.request',
  'rooms.view',
  'rooms.status',
  'rentals.view',
  'rentals.create',
  'rentals.status',
  'rentals.checklist',
  'rentals.payment.desk',
  'inventory.view',
  'inventory.repair',
  'venues.view',
  'venues.pipeline',
  'customers.view',
  'customers.note',
  'inbox.view',
  'inbox.manage',
]);

/** What each per-staff grant adds. Content never includes deletes. */
const GRANT_ADDS: Record<Grant, readonly Capability[]> = {
  content: ['content.edit'],
  reports: ['reports.view'],
  inventoryEdit: ['inventory.edit'],
  venueQuotes: ['venues.quote'],
  exports: ['exports.download'],
};

/** Super Admin has no use for "request a refund"; they refund directly. */
const SUPER_ONLY_EXCLUDED: ReadonlySet<Capability> = new Set<Capability>(['bookings.refund.request']);

export type Actor = { id: string; role: Role; grants: readonly Grant[]; active: boolean };

export function can(actor: Actor | null | undefined, capability: Capability): boolean {
  if (!actor || !actor.active) return false;
  if (actor.role === 'super_admin') return !SUPER_ONLY_EXCLUDED.has(capability);
  if (STAFF_BASE.has(capability)) return true;
  return actor.grants.some((g) => GRANT_ADDS[g].includes(capability));
}

export function capabilitiesOf(actor: Actor): Capability[] {
  return CAPABILITIES.filter((c) => can(actor, c));
}

/** Every money action re-asks for the signed-in user's password. */
export const MONEY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'bookings.payment.desk',
  'bookings.refund',
  'bookings.refund.request',
  'refunds.approve',
  'rentals.payment.desk',
  'rentals.refund',
  'rentals.checklist',
  'payments.manage',
]);

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(readonly capability: Capability) {
    super(`Not allowed: ${capability}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(actor: Actor | null | undefined, capability: Capability): asserts actor is Actor {
  if (!can(actor, capability)) throw new ForbiddenError(capability);
}

/** Admin screens and the capability that shows each one in the sidebar and palette. */
export const SCREENS = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard', group: 'Overview', needs: 'dashboard.view' },
  { key: 'bookings', href: '/admin/bookings', label: 'Room bookings', group: 'Front desk', needs: 'bookings.view' },
  { key: 'rooms', href: '/admin/rooms', label: 'Rooms & rates', group: 'Front desk', needs: 'rooms.view' },
  { key: 'customers', href: '/admin/customers', label: 'Customers', group: 'Front desk', needs: 'customers.view' },
  { key: 'inbox', href: '/admin/inbox', label: 'Inbox', group: 'Front desk', needs: 'inbox.view' },
  { key: 'rentals', href: '/admin/rentals', label: 'Rental orders', group: 'Events', needs: 'rentals.view' },
  { key: 'inventory', href: '/admin/inventory', label: 'Rental inventory', group: 'Events', needs: 'inventory.view' },
  { key: 'venues', href: '/admin/venues', label: 'Venues & enquiries', group: 'Events', needs: 'venues.view' },
  { key: 'payments', href: '/admin/payments', label: 'Payments & refunds', group: 'Money', needs: 'payments.view' },
  { key: 'reports', href: '/admin/reports', label: 'Reports', group: 'Money', needs: 'reports.view' },
  { key: 'content', href: '/admin/content', label: 'Content', group: 'Website', needs: 'content.edit' },
  { key: 'settings', href: '/admin/settings', label: 'Settings', group: 'Admin', needs: 'settings.view' },
  { key: 'users', href: '/admin/users', label: 'Users & permissions', group: 'Admin', needs: 'users.view' },
  { key: 'audit', href: '/admin/audit', label: 'Audit log', group: 'Admin', needs: 'audit.view' },
] as const satisfies readonly { key: string; href: string; label: string; group: string; needs: Capability }[];

export function visibleScreens(actor: Actor) {
  return SCREENS.filter((s) => can(actor, s.needs));
}
