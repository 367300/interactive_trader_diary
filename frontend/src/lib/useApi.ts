import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export interface ApiQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (!cancelled.current) {
        setData(result);
      }
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof ApiError ? e.message : 'Ошибка запроса');
      }
    } finally {
      if (!cancelled.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    cancelled.current = false;
    void reload();
    return () => {
      cancelled.current = true;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
