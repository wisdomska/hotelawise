'use client';
// What every admin screen can reach: who is signed in and what they may do,
// toasts, and the single drawer and modal the shell hosts (as in the prototype,
// one drawer and one modal at a time).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Capability } from '@/server/auth/permissions';
import { adminToast } from './toast';

export type Me = {
  name: string;
  email: string;
  initials: string;
  roleLabel: string;
  roleShort: string;
  isSuper: boolean;
};

export type DrawerSpec =
  | { kind: 'booking'; ref: string }
  | { kind: 'rental'; ref: string }
  | { kind: 'customer'; id: string }
  | { kind: 'room'; number: string }
  | { kind: 'enquiry'; ref: string };

type Ctx = {
  me: Me;
  can: (c: Capability) => boolean;
  toast: (title: string, body?: string) => void;
  drawer: DrawerSpec | null;
  openDrawer: (d: DrawerSpec) => void;
  closeDrawer: () => void;
  modal: ReactNode;
  openModal: (m: ReactNode) => void;
  closeModal: () => void;
  /** Re-runs the server components for the current screen. */
  refresh: () => void;
};

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({ me, capabilities, children }: { me: Me; capabilities: Capability[]; children: ReactNode }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null);
  const [modal, setModal] = useState<ReactNode>(null);
  const caps = useMemo(() => new Set(capabilities), [capabilities]);
  const refresh = useCallback(() => router.refresh(), [router]);
  const value = useMemo<Ctx>(
    () => ({
      me,
      can: (c) => caps.has(c),
      toast: adminToast,
      drawer,
      openDrawer: (d) => {
        setModal(null);
        setDrawer(d);
      },
      closeDrawer: () => setDrawer(null),
      modal,
      openModal: (m) => setModal(m),
      closeModal: () => setModal(null),
      refresh,
    }),
    [me, caps, drawer, modal, refresh],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): Ctx {
  const c = useContext(AdminContext);
  if (!c) throw new Error('useAdmin outside AdminProvider');
  return c;
}
