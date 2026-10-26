'use client';
// The rental cart, kept in sessionStorage so it survives the move from the
// catalogue (/rent) to checkout (/rent/checkout) and a page refresh.
import { useSyncExternalStore } from 'react';
import { addDays, todayInAccra, type IsoDate } from '@/lib/dates';

export type RentState = { from: IsoDate; to: IsoDate; cart: Record<string, number>; packs: string[] };

const KEY = 'aw.rent';
const listeners = new Set<() => void>();
let cache: RentState | null = null;

function initial(): RentState {
  const from = addDays(todayInAccra(), 7);
  return { from, to: addDays(from, 1), cart: {}, packs: [] };
}

function read(): RentState {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RentState) : null;
    cache = parsed && parsed.from >= todayInAccra() ? parsed : initial();
  } catch {
    cache = initial();
  }
  return cache;
}

export function setRent(next: Partial<RentState> | ((s: RentState) => Partial<RentState>)) {
  const cur = read();
  cache = { ...cur, ...(typeof next === 'function' ? next(cur) : next) };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private mode: the cart still works for this page view.
  }
  listeners.forEach((l) => l());
}

const SERVER: RentState = { from: '', to: '', cart: {}, packs: [] };

export function useRent(): RentState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => SERVER,
  );
}
