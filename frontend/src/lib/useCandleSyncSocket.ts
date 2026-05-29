import { useCallback, useEffect, useRef, useState } from 'react';
import { adminCandleSync } from '@/api/endpoints';
import { tokenStore } from '@/api/client';
import type { CandleSyncEvent } from '@/api/types';

type State = 'idle' | 'running' | 'done' | 'error';

export interface UseCandleSyncSocketOptions {
  enabled: boolean;
  onProgress?: (e: CandleSyncEvent) => void;
  onDone?: (e: CandleSyncEvent) => void;
  onError?: (e: CandleSyncEvent) => void;
}

const BACKOFF_MS = [1000, 2000, 5000, 10000];

function buildWsUrl(ticker: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  return `${proto}://${host}/ws/candles-sync/${encodeURIComponent(ticker)}/?token=${encodeURIComponent(token)}`;
}

export function useCandleSyncSocket(
  ticker: string | null,
  opts: UseCandleSyncSocketOptions,
): { state: State; last: CandleSyncEvent | null } {
  const [state, setState] = useState<State>('idle');
  const [last, setLast] = useState<CandleSyncEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);
  const stateRef = useRef<State>('idle');

  const dispatch = useCallback((evt: CandleSyncEvent) => {
    setLast(evt);
    switch (evt.type) {
      case 'sync.snapshot':
      case 'sync.progress':
        setState('running');
        stateRef.current = 'running';
        opts.onProgress?.(evt);
        break;
      case 'sync.done':
        setState('done');
        stateRef.current = 'done';
        opts.onDone?.(evt);
        break;
      case 'sync.error':
        setState('error');
        stateRef.current = 'error';
        opts.onError?.(evt);
        break;
    }
  }, [opts]);

  useEffect(() => {
    aliveRef.current = true;
    if (!opts.enabled || !ticker) return;

    adminCandleSync.state(ticker).then((snap) => {
      if (aliveRef.current && snap) {
        dispatch({ ...(snap as object), type: 'sync.snapshot' } as CandleSyncEvent);
      }
    }).catch(() => { /* noop */ });

    function connect() {
      const token = tokenStore.access ?? '';
      const ws = new WebSocket(buildWsUrl(ticker!, token));
      wsRef.current = ws;
      ws.onopen = () => { attemptRef.current = 0; };
      ws.onmessage = (e) => {
        try { dispatch(JSON.parse(e.data) as CandleSyncEvent); } catch { /* ignore */ }
      };
      ws.onclose = (e) => {
        if (!aliveRef.current) return;
        if (e.code === 4403 || e.code === 4404) {
          setState('error');
          stateRef.current = 'error';
          return;
        }
        if (stateRef.current !== 'running') return;
        const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
        attemptRef.current += 1;
        setTimeout(() => { if (aliveRef.current) connect(); }, delay);
      };
      ws.onerror = () => { /* close handles */ };
    }
    connect();

    return () => {
      aliveRef.current = false;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, opts.enabled]);

  return { state, last };
}
