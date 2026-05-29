import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/endpoints', () => ({
  adminCandleSync: {
    start: vi.fn(async () => ({ task_id: 't1', ticker: 'SBER' })),
    state: vi.fn(async () => null),
  },
}));

let mockState: 'idle' | 'running' | 'done' | 'error' = 'idle';
let mockLast: any = null;
vi.mock('@/lib/useCandleSyncSocket', () => ({
  useCandleSyncSocket: () => ({ state: mockState, last: mockLast }),
}));

import AdminCandleSyncButton from '../AdminCandleSyncButton';
import { adminCandleSync } from '@/api/endpoints';

beforeEach(() => {
  mockState = 'idle';
  mockLast = null;
  vi.clearAllMocks();
});

describe('AdminCandleSyncButton', () => {
  it('idle: renders button with title', () => {
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    const btn = screen.getByRole('button');
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/догрузить/i));
  });

  it('click triggers start()', async () => {
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    await userEvent.click(screen.getByRole('button'));
    expect(adminCandleSync.start).toHaveBeenCalledWith('SBER', {});
  });

  it('running: shows progress fraction', () => {
    mockState = 'running';
    mockLast = {
      type: 'sync.progress',
      task_id: 't1', done_ranges: 2, total_ranges: 5,
      range_from: '2026-05-04', range_till: '2026-05-04',
      range_candles: 10, cumulative_candles: 25,
    };
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    expect(screen.getByText(/2.*5/)).toBeInTheDocument();
  });

  it('error: shows error state', () => {
    mockState = 'error';
    mockLast = { type: 'sync.error', task_id: 't1', message: 'no_token' };
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'error');
  });
});
