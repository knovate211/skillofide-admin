// What the top bar's bell counts: work waiting on an admin. It comes from the
// same /api/admin/stats the dashboard uses, cached for a minute so moving
// between pages does not refetch it every time. The dashboard pushes its own
// fresh copy in through primeAlerts.

import { useEffect, useState } from 'react';
import { getStats, type AdminStats } from './api';

export interface AlertItem {
  label: string;
  count: number;
  to: string;
}

const TTL_MS = 60_000;
let cached: { at: number; stats: AdminStats } | null = null;
let inflight: Promise<AdminStats> | null = null;
const listeners = new Set<() => void>();

export function primeAlerts(stats: AdminStats) {
  cached = { at: Date.now(), stats };
  listeners.forEach((l) => l());
}

function toItems(s: AdminStats | undefined): AlertItem[] {
  if (!s) return [];
  return [
    { label: 'New enquiries', count: s.enquiries_new, to: '/enquiries?status=new' },
    { label: 'Scholarships to decide', count: s.scholarship_pending, to: '/scholarship' },
    { label: 'Answers to grade', count: s.answers_to_grade, to: '/dashboard#grading' },
  ].filter((i) => i.count > 0);
}

export function useAlerts(enabled: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cached || Date.now() - cached.at > TTL_MS) {
      inflight ??= getStats()
        .then((s) => {
          primeAlerts(s);
          return s;
        })
        .finally(() => {
          inflight = null;
        });
      inflight.catch(() => undefined);
    }
    return () => {
      listeners.delete(l);
    };
  }, [enabled]);

  const items = enabled ? toItems(cached?.stats) : [];
  return { items, total: items.reduce((n, i) => n + i.count, 0) };
}
