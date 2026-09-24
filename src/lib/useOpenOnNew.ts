import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens a page's "create" dialog when the URL carries ?new=1 — which is how the
 * dashboard's Quick Actions land on a form rather than on a list. The flag is
 * removed straight away so a refresh or Back does not reopen the dialog.
 */
export function useOpenOnNew(open: () => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1') return;
    open();
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
