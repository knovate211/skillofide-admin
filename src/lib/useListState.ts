import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters and page kept in the URL, so a refresh or a shared link reopens the
 * same view and dashboard tiles can deep-link into a filtered list.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const keyList = keys.join(',');

  const filters = useMemo(
    () => Object.fromEntries(keys.map((k) => [k, params.get(k) || ''])) as Record<K, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, keyList],
  );
  const page = Math.max(1, Number(params.get('page')) || 1);
  const active = keys.some((k) => !!filters[k]);

  const setFilter = useCallback(
    (key: K, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page'); // a new filter starts at page 1
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(params);
      if (p > 1) next.set('page', String(p));
      else next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  // Replaces every filter at once — for a switch (like changing course) that
  // should drop filters which only made sense in the old context.
  const replaceFilters = useCallback(
    (next: Partial<Record<K, string>>) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) p.set(k, v as string);
      setParams(p, { replace: true });
    },
    [setParams],
  );

  return { filters, page, active, setFilter, setPage, clear, replaceFilters };
}

/**
 * Row selection with a Gmail-style "select all N matching" mode. In that mode
 * no ids are held: the server re-runs the filters, so rows on pages the admin
 * never opened are included.
 */
export function useSelection(resetKey: unknown) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);

  // A changed filter means a different set of rows; carrying a selection
  // across it would act on rows no longer on screen.
  useEffect(() => {
    setIds(new Set());
    setAllMatching(false);
  }, [resetKey]);

  const toggle = (id: string) => {
    setAllMatching(false);
    setIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const togglePage = (pageIds: string[]) => {
    setAllMatching(false);
    setIds((s) => {
      const all = pageIds.length > 0 && pageIds.every((id) => s.has(id));
      const n = new Set(s);
      pageIds.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  const clear = () => {
    setIds(new Set());
    setAllMatching(false);
  };

  return { ids, allMatching, setAllMatching, toggle, togglePage, clear, has: (id: string) => allMatching || ids.has(id) };
}
