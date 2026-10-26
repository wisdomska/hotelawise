'use client';
// Renders the open detail drawer. Each screen's drawer registers here as it
// is built (bookings, rentals, customers, rooms, enquiries).
import type { ComponentType } from 'react';
import { useAdmin, type DrawerSpec } from './context';

const DRAWERS: Partial<{ [K in DrawerSpec['kind']]: ComponentType<{ spec: Extract<DrawerSpec, { kind: K }> }> }> = {};

export function DrawerHost() {
  const { drawer } = useAdmin();
  if (!drawer) return null;
  const C = DRAWERS[drawer.kind] as ComponentType<{ spec: DrawerSpec }> | undefined;
  return C ? <C spec={drawer} /> : null;
}
