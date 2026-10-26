'use client';
// Runs an admin server action: busy flag, field errors for the open modal, a
// toast, and a refresh of the screen's server data when it worked.
import { useCallback, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/admin/result';
import { useAdmin } from './context';

export function useAction() {
  const { toast, refresh, closeModal } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const run = useCallback(
    async (fn: () => Promise<ActionResult>, opts: { close?: boolean } = {}) => {
      setBusy(true);
      try {
        const r = await fn();
        if (r.ok) {
          setErrors({});
          if (opts.close !== false) closeModal();
          toast(r.title, r.body);
          start(() => refresh());
        } else {
          setErrors(r.fields ?? {});
          if (!r.fields || !Object.keys(r.fields).length) toast(r.error);
        }
        return r;
      } catch {
        toast('That didn’t work.', 'Check your connection and try again.');
        return { ok: false, error: 'network' } as ActionResult;
      } finally {
        setBusy(false);
      }
    },
    [toast, refresh, closeModal],
  );
  return { run, busy, errors, setErrors };
}
