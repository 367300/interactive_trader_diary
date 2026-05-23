import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export interface ApiQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Загрузка данных с фиксированным набором зависимостей.
 *
 * Inline-стрелка `() => api.x(params)` пересоздаётся на каждом рендере,
 * поэтому держим её в ref-е и не тащим в зависимости эффекта — иначе любая
 * утечка `fn` в `deps` (либо нестабильный объект в пользовательском `deps`)
 * крутила бы запросы в бесконечном цикле. Эффект перезапускается строго
 * на смену пользовательских `deps`; ref гарантирует вызов последней версии `fn`.
 *
 * Cancel-флаг — локальный в замыкании эффекта: при StrictMode-перемонтировании
 * первый запрос аккуратно сбрасывается, без гонок с shared-ref'ом.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка запроса');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fnRef.current();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Ошибка запроса');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload };
}
