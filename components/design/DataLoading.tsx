'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PageLoader } from './PageLoader';

/**
 * Real loading state for the AllSoulLearn loading screen.
 *
 * Pages hand their in-flight requests to `track()`; the provider counts how
 * many are open and how many have settled, and the screen stays up exactly
 * that long — fast network, brief flash; slow network, it waits. Nothing here
 * is on a timer.
 *
 * Route changes are NOT tracked here. Next already holds the old page and
 * shows `loading.tsx` while the next route is being fetched and rendered, and
 * that fallback ends the moment the route is ready.
 */
type Counts = { total: number; done: number };

/** Passes the promise straight back, so a tracked call reads like the plain one. */
type Track = <T>(p: Promise<T>) => Promise<T>;

/**
 * The counters and the way to move them are two separate contexts on purpose.
 * A page reads `track` inside an effect keyed on it, so `track` must keep the
 * same identity for the life of the page — if it changed whenever the counts
 * changed, tracking a request would re-run the effect that fired it, which
 * fires it again, forever. Actions never change; only the counts do.
 */
const ActionsContext = createContext<{ add: () => void; complete: () => void } | null>(null);
const CountsContext = createContext<Counts>({ total: 0, done: 0 });

export function DataLoadingProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>({ total: 0, done: 0 });

  const add = useCallback(() => setCounts((c) => ({ ...c, total: c.total + 1 })), []);

  // Draining the last open request resets the pair rather than leaving
  // total === done behind, so the next page starts its bar from zero instead of
  // inheriting a full one.
  const complete = useCallback(
    () =>
      setCounts((c) =>
        c.done + 1 >= c.total ? { total: 0, done: 0 } : { total: c.total, done: c.done + 1 },
      ),
    [],
  );

  const actions = useMemo(() => ({ add, complete }), [add, complete]);

  return (
    <ActionsContext.Provider value={actions}>
      <CountsContext.Provider value={counts}>{children}</CountsContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * Returns `track(promise)` — wrap every request a page needs before it can be
 * read, and the loading screen covers the page until they all settle
 * (rejections included; a failed request must not hold the screen up forever,
 * the page shows its own error state instead).
 *
 * Only the FIRST batch a component fires is tracked. Later requests — a retry
 * button, a refresh after booking — run untracked, because throwing a
 * full-screen loader over a page the user is already reading is worse than the
 * small spinner those flows have of their own.
 */
export function useLoadingTracker(): Track {
  const actions = useContext(ActionsContext);
  const open = useRef(0);
  const settled = useRef(false);

  // A navigation the user abandons unmounts the page while its requests are
  // still open. Releasing them here keeps the screen from waiting on an answer
  // nobody is going to read.
  useEffect(
    () => () => {
      if (!actions) return;
      for (let i = 0; i < open.current; i++) actions.complete();
      open.current = 0;
    },
    [actions],
  );

  return useCallback<Track>(
    (p) => {
      if (!actions || settled.current) return p;
      open.current += 1;
      actions.add();
      return p.finally(() => {
        // Guard against double-release: the unmount cleanup may have got here
        // first, and completing twice would drive `done` past `total`.
        if (open.current === 0) return;
        open.current -= 1;
        if (open.current === 0) settled.current = true;
        actions.complete();
      });
    },
    [actions],
  );
}

/** The screen itself. Mounted once, next to the page tree. */
export function DataLoadingScreen() {
  const { total, done } = useContext(CountsContext);
  if (total === 0) return null;
  return <PageLoader variant="full" progress={done / total} />;
}

export default DataLoadingProvider;
