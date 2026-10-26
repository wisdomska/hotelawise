import { describe, expect, it } from 'vitest';
import {
  assertCan, can, capabilitiesOf, CAPABILITIES, ForbiddenError, GRANTS, visibleScreens,
  type Actor, type Capability, type Grant,
} from '@/server/auth/permissions';

const superAdmin: Actor = { id: 's', role: 'super_admin', grants: [], active: true };
const staff = (grants: Grant[] = []): Actor => ({ id: 't', role: 'staff', grants, active: true });

// The expected matrix, written out by hand from docs/PLAN.md §5 (independently of the implementation).
const STAFF_ALLOWED = new Set<Capability>([
  'dashboard.view', 'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.checkin', 'bookings.checkout',
  'bookings.payment.desk', 'bookings.note', 'bookings.refund.request', 'rooms.view', 'rooms.status',
  'rentals.view', 'rentals.create', 'rentals.status', 'rentals.checklist', 'rentals.payment.desk',
  'inventory.view', 'inventory.repair', 'venues.view', 'venues.pipeline', 'customers.view', 'customers.note',
  'inbox.view', 'inbox.manage',
]);
const GRANT_ADDS: Record<Grant, Capability> = {
  content: 'content.edit', reports: 'reports.view', inventoryEdit: 'inventory.edit', venueQuotes: 'venues.quote', exports: 'exports.download',
};

describe('permission matrix: every cell', () => {
  for (const cap of CAPABILITIES) {
    it(`super admin × ${cap}`, () => expect(can(superAdmin, cap)).toBe(cap !== 'bookings.refund.request'));
    it(`staff (no grants) × ${cap}`, () => expect(can(staff(), cap)).toBe(STAFF_ALLOWED.has(cap)));
    for (const g of GRANTS) {
      it(`staff + ${g} × ${cap}`, () => expect(can(staff([g]), cap)).toBe(STAFF_ALLOWED.has(cap) || GRANT_ADDS[g] === cap));
    }
  }
});

describe('guards', () => {
  it('denies inactive users and anonymous callers everything', () => {
    for (const cap of CAPABILITIES) {
      expect(can({ ...superAdmin, active: false }, cap)).toBe(false);
      expect(can(null, cap)).toBe(false);
    }
  });
  it('never lets staff refund, delete, see revenue, settings, users or the audit log, whatever the grants', () => {
    const all = staff([...GRANTS]);
    for (const cap of ['bookings.refund', 'bookings.delete', 'refunds.approve', 'rentals.refund', 'rentals.delete', 'dashboard.revenue', 'customers.spend', 'content.delete', 'payments.view', 'settings.view', 'settings.keys.reveal', 'users.manage', 'audit.view', 'rooms.edit'] as const) {
      expect(can(all, cap)).toBe(false);
    }
  });
  it('throws a 403 ForbiddenError', () => {
    expect(() => assertCan(staff(), 'payments.view')).toThrow(ForbiddenError);
    try {
      assertCan(null, 'audit.view');
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
    expect(() => assertCan(superAdmin, 'audit.view')).not.toThrow();
  });
  it('hides screens staff cannot use', () => {
    expect(visibleScreens(superAdmin).map((s) => s.key)).toHaveLength(14);
    expect(visibleScreens(staff()).map((s) => s.key)).toEqual(['dashboard', 'bookings', 'rooms', 'customers', 'inbox', 'rentals', 'inventory', 'venues']);
    expect(visibleScreens(staff(['content', 'reports'])).map((s) => s.key)).toContain('content');
    expect(capabilitiesOf(staff()).length).toBe(STAFF_ALLOWED.size);
  });
});
