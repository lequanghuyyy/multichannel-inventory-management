import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../core/api-error';
import type { DemoMode } from '../../mocks/mock-api';

/**
 * The single-resource sibling of `useApiPage`.
 *
 * `useApiPage` is the wrong tool for a screen like Reports: its contract is a cursor and a
 * page, and the only way to express "this is one aggregate, and the reader changed a filter"
 * through it is to invent a cursor the API does not have. So this hook takes a `deps` list
 * instead and refetches when it changes, which is the only thing a filter genuinely needs.
 *
 * The fallback rules are copied from `useApiPage` unchanged, deliberately. A 4xx is an answer,
 * so it is surfaced rather than replaced by a prototype baseline — on Reports that matters as
 * much as it does on a detail screen, because a bad period would otherwise be answered with a
 * handsome fixture full of numbers that never happened.
 */
export type ApiResource<TApi, TFixture = TApi> = {
  value: TApi | TFixture | null;
  loading: boolean;
  error: unknown;
  /** Set only when the fallback also failed; the screen still has its value otherwise. */
  fixtureError: unknown;
  source: 'api' | 'fixture';
  refresh: () => void;
};

export function useApiResource<TApi, TFixture = TApi>(
  loader: (signal: AbortSignal) => Promise<TApi>,
  loadFixture: (mode: DemoMode) => Promise<TFixture | undefined>,
  mode: DemoMode,
  deps: readonly unknown[] = [],
): ApiResource<TApi | TFixture> {
  const [value, setValue] = useState<TApi | TFixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fixtureError, setFixtureError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  // Starts as 'fixture' and is promoted to 'api' by a resolved request, for the same reason
  // `useApiPage` does: "not loaded yet" and "the API failed" both leave the value null, and
  // labelling the first render as a loaded baseline would badge a spinner as sample data.
  const [source, setSource] = useState<'api' | 'fixture'>('fixture');

  const loaderRef = useRef(loader);
  const fixtureRef = useRef(loadFixture);
  loaderRef.current = loader;
  fixtureRef.current = loadFixture;
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    setFixtureError(null);

    void Promise.resolve().then(() => loaderRef.current(controller.signal)).then((result) => {
      if (controller.signal.aborted) return;
      setValue(result);
      setSource('api');
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setValue(null);
      setError(reason);
      if (reason instanceof ApiRequestError && reason.isClientError) {
        setFixtureError(reason);
        return;
      }
      void Promise.resolve().then(() => fixtureRef.current(mode)).then((fallback) => {
        if (controller.signal.aborted) return;
        setValue(fallback ?? null);
        setSource('fixture');
      }).catch((fixtureReason: unknown) => {
        if (controller.signal.aborted) return;
        setFixtureError(fixtureReason);
      });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
    // `deps` is the caller's filter list. The loaders are held in refs, exactly as in
    // `useApiPage`, because they are inline arrows whose identity changes every render.
  }, [attempt, mode, ...deps]);

  useEffect(() => () => { inFlight.current?.abort(); }, []);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);

  return { value, loading, error, fixtureError, source, refresh };
}