import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/api/endpoints', () => ({
  adminCandleSync: {
    state: vi.fn(async () => null),
  },
}));

import { useCandleSyncSocket } from '../useCandleSyncSocket';

class MockWS {
  static instances: MockWS[] = [];
  url: string;
  readyState = 0;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;
  onerror?: () => void;
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });
  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockWS.instances = [];
  // @ts-expect-error mock
  globalThis.WebSocket = MockWS;
  localStorage.setItem('td_access', 'fake-token');
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useCandleSyncSocket', () => {
  it('opens WS with token query when enabled', async () => {
    renderHook(() => useCandleSyncSocket('SBER', { enabled: true }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    expect(MockWS.instances[0].url).toContain('/ws/candles-sync/SBER/');
    expect(MockWS.instances[0].url).toContain('token=fake-token');
  });

  it('updates state to running on progress event', async () => {
    const { result } = renderHook(() => useCandleSyncSocket('SBER', { enabled: true }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    act(() => {
      MockWS.instances[0].emit({
        type: 'sync.progress',
        task_id: 't1', done_ranges: 1, total_ranges: 3,
        range_from: '2026-05-04', range_till: '2026-05-04',
        range_candles: 5, cumulative_candles: 5,
      });
    });
    await waitFor(() => expect(result.current.state).toBe('running'));
    expect(result.current.last?.type).toBe('sync.progress');
  });

  it('switches to done on sync.done', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useCandleSyncSocket('SBER', { enabled: true, onDone }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    act(() => {
      MockWS.instances[0].emit({
        type: 'sync.done', task_id: 't1', total_ranges: 1,
        cumulative_candles: 5, duration_s: 1.2, errors: 0,
      });
    });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('does not open WS when enabled=false', async () => {
    renderHook(() => useCandleSyncSocket('SBER', { enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(MockWS.instances.length).toBe(0);
  });
});
