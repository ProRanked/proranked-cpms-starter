import { useEffect, useState, useCallback } from 'react';
import { ApiError } from './api';

export interface Resource<T> { data: T | null; loading: boolean; error: ApiError | null; reload: () => void }

/**
 * One-liner data fetching for every page — replaces the repeated useEffect+useState+loading+err block.
 * Pass a thunk and a deps array; returns { data, loading, error, reload }. Zero-dep (no react-query).
 * If `enabled` is false the fetch is skipped (use for lazy tabs / missing network).
 *
 *   const chargers = useResource(() => api.chargers(network), [network], !!network);
 */
export function useResource<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let live = true;
    setLoading(true); setError(null);
    fn()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) { setError(e instanceof ApiError ? e : new ApiError(0, 'error', String(e?.message ?? e))); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  return { data, loading, error, reload };
}
