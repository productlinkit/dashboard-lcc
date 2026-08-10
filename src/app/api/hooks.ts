/*
 * A small data-fetching layer.
 *
 * The app has no query library and adding one would mean reshaping every page,
 * so this is the minimum that a page actually needs: run a request, expose
 * loading / error / data, cancel it if the component unmounts or the inputs
 * change, and offer a refetch. Mutations get the same treatment plus a pending
 * flag and the field errors a form has to render.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./client";

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  /** True while a refetch runs over data that is already on screen. */
  refreshing: boolean;
  refetch: () => void;
}

export interface QueryOptions {
  /** Skip the request entirely — for data that needs a signed-in user. */
  enabled?: boolean;
}

/**
 * Run an async request and track its state.
 *
 * `deps` behaves like a useEffect dependency list: change one and the request
 * runs again. The previous request is aborted, and a response that arrives
 * after a newer one was started is discarded, so a fast-typing search box
 * cannot leave stale rows on screen.
 */
export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: QueryOptions = {},
): QueryState<T> {
  const enabled = options.enabled !== false;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  // The fetcher is a new closure on every render; keeping it in a ref lets the
  // effect depend on `deps` alone instead of re-running on each render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const generation = useRef(0);
  const hasData = data !== undefined;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const mine = ++generation.current;

    if (hasData) setRefreshing(true);
    else setLoading(true);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (mine !== generation.current) return; // a newer request won
        setData(result);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (mine !== generation.current) return;
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", (err as Error).message));
      })
      .finally(() => {
        if (mine !== generation.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refreshing, refetch };
}

export interface MutationState<TArgs, TResult> {
  run: (args: TArgs) => Promise<TResult>;
  pending: boolean;
  error: ApiError | undefined;
  /** Field errors from the last failure, keyed by field name. */
  fieldErrors: Record<string, string>;
  data: TResult | undefined;
  reset: () => void;
}

/**
 * Wrap a write request.
 *
 * `run` resolves with the result and rejects on failure, so a caller can await
 * it and branch; the same failure is also captured in `error` and
 * `fieldErrors` for a form to render without its own try/catch.
 */
export function useMutation<TArgs, TResult>(
  action: (args: TArgs) => Promise<TResult>,
): MutationState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [data, setData] = useState<TResult | undefined>(undefined);

  const actionRef = useRef(action);
  actionRef.current = action;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (args: TArgs) => {
    setPending(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const result = await actionRef.current(args);
      if (alive.current) setData(result);
      return result;
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", (err as Error).message);
      if (alive.current) {
        setError(apiErr);
        setFieldErrors(apiErr.fieldMap());
      }
      throw apiErr;
    } finally {
      if (alive.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(undefined);
    setFieldErrors({});
    setData(undefined);
  }, []);

  return { run, pending, error, fieldErrors, data, reset };
}

/** Debounce a value — used to keep a search box from firing on every keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
