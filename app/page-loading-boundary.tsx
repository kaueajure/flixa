"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import PageLoader from "./page-loader";

const PageReadyContext = createContext<(() => void) | null>(null);

/** Each view signals when its initial request settles; background refreshes keep the page visible. */
export function usePageReady(ready: boolean) {
  const signalReady = useContext(PageReadyContext);
  useEffect(() => { if (ready) signalReady?.(); }, [ready, signalReady]);
}

function ReadySignal({ ready }: { ready: boolean }) {
  usePageReady(ready);
  return null;
}

export default function PageLoadingBoundary({ children, loading = false, waitForReady = false, label, pageKey }: {
  children: ReactNode;
  loading?: boolean;
  waitForReady?: boolean;
  label: string;
  pageKey: string;
}) {
  const [ready, setReady] = useState(false);
  const signalReady = useCallback(() => setReady(true), []);
  const pending = loading || !ready;
  return (
    <PageReadyContext.Provider value={signalReady}>
      <div className="page-loading-boundary" data-page-key={pageKey} data-load-state={pending ? "loading" : "ready"}>
        {pending ? <PageLoader label={label} /> : null}
        <div className="page-loading-content" hidden={pending} aria-busy={pending}>
          {children}
          {!waitForReady ? <ReadySignal ready={!loading} /> : null}
        </div>
      </div>
    </PageReadyContext.Provider>
  );
}
