import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Мокаем CandlestickChart — он не должен дёргать реальный lightweight-charts/API свечей
vi.mock('@/components/CandlestickChart', () => ({
  default: ({ onPointPick, pickerMode }: any) => (
    <div data-testid="mock-chart">
      <button
        data-testid="mock-pick-entry"
        onClick={() => onPointPick?.({ time: 1700000000, price: 100 })}
      >
        pick entry
      </button>
      <button
        data-testid="mock-pick-sl"
        onClick={() => onPointPick?.({ time: 1700000000, price: 95 })}
      >
        pick sl
      </button>
      <button
        data-testid="mock-pick-tp"
        onClick={() => onPointPick?.({ time: 1700000000, price: 110 })}
      >
        pick tp
      </button>
      <button
        data-testid="mock-pick-close"
        onClick={() => onPointPick?.({ time: 1700001000, price: 108 })}
      >
        pick close
      </button>
      <span data-testid="picker-mode">{String(pickerMode)}</span>
    </div>
  ),
  CandlestickChart: ({ onPointPick, pickerMode }: any) => (
    <div data-testid="mock-chart">
      <button data-testid="mock-pick-entry" onClick={() => onPointPick?.({ time: 1700000000, price: 100 })}>pick entry</button>
      <button data-testid="mock-pick-sl" onClick={() => onPointPick?.({ time: 1700000000, price: 95 })}>pick sl</button>
      <button data-testid="mock-pick-tp" onClick={() => onPointPick?.({ time: 1700000000, price: 110 })}>pick tp</button>
      <button data-testid="mock-pick-close" onClick={() => onPointPick?.({ time: 1700001000, price: 108 })}>pick close</button>
      <span data-testid="picker-mode">{String(pickerMode)}</span>
    </div>
  ),
}));

const mockCreateQuickChain = vi.fn();
const mockListTrades = vi.fn().mockResolvedValue({ results: [] });
const mockListStrategies = vi.fn().mockResolvedValue({
  results: [{ id: 1, name: 'Скальпинг' }],
});
const mockListInstruments = vi.fn().mockResolvedValue({
  results: [{ id: 42, ticker: 'SBER', name: 'Сбербанк' }],
});

vi.mock('@/api/endpoints', () => ({
  tradesApi: {
    list: (...args: any[]) => mockListTrades(...args),
    get: vi.fn(),
    createQuickChain: (...args: any[]) => mockCreateQuickChain(...args),
  },
  strategiesApi: {
    list: () => mockListStrategies(),
  },
  instrumentsApi: {
    list: (...args: any[]) => mockListInstruments(...args),
    search: vi.fn().mockResolvedValue([
      { id: 42, ticker: 'SBER', name: 'Сбербанк' },
    ]),
  },
}));

import { QuickTradeEntryPage } from '../QuickTradeEntryPage';

function setup() {
  return render(
    <MemoryRouter>
      <QuickTradeEntryPage />
    </MemoryRouter>
  );
}

async function selectInstrumentAndStrategy(user: ReturnType<typeof userEvent.setup>) {
  const searchInput = screen.getByPlaceholderText(/SBER/);
  await user.type(searchInput, 'SBER');
  const result = await screen.findByText(/SBER — Сбербанк/);
  await user.click(result);

  await screen.findByRole('option', { name: 'Скальпинг' });
  await user.selectOptions(screen.getByRole('combobox'), '1');
}

describe('QuickTradeEntryPage', () => {
  beforeEach(() => {
    mockCreateQuickChain.mockReset();
    mockListTrades.mockClear();
    mockListStrategies.mockClear();
    mockListInstruments.mockClear();
  });

  it('добавляет AVERAGE leg после полного OPEN-цикла + клика по графику', async () => {
    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    // OPEN: вход → SL → TP
    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));
    expect(screen.getByTestId('leg-0')).toHaveTextContent('OPEN');

    // AVERAGE
    await user.click(screen.getByText('+ Усреднение'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    expect(screen.getByTestId('leg-1')).toHaveTextContent('AVG');
  });

  it('save вызывает API с правильным payload', async () => {
    mockCreateQuickChain.mockResolvedValue({
      open_trade: { id: 'uuid-1' },
      chain_id: 'uuid-1',
    });

    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));

    await user.click(screen.getByText('+ Закрытие'));
    await user.click(screen.getByTestId('mock-pick-close'));

    await user.click(screen.getByTestId('save-chain'));

    await waitFor(() => expect(mockCreateQuickChain).toHaveBeenCalled());
    const payload = mockCreateQuickChain.mock.calls[0][0];
    expect(payload.instrument_id).toBe(42);
    expect(payload.strategy_id).toBe(1);
    expect(payload.direction).toBe('LONG');
    expect(payload.legs).toHaveLength(2);
    expect(payload.legs[0].type).toBe('OPEN');
    expect(payload.legs[1].type).toBe('CLOSE');
  });

  it('error 400 подсвечивает leg и non-field error', async () => {
    mockCreateQuickChain.mockRejectedValue({
      response: {
        data: {
          legs: [null, { price: 'должна быть > 0' }],
          non_field_errors: ['Сумма не сходится'],
        },
      },
    });

    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));
    await user.click(screen.getByText('+ Закрытие'));
    await user.click(screen.getByTestId('mock-pick-close'));
    await user.click(screen.getByTestId('save-chain'));

    await waitFor(() => {
      expect(screen.getByTestId('non-field-error')).toHaveTextContent('Сумма не сходится');
    });
    expect(screen.getByText('должна быть > 0')).toBeInTheDocument();
  });

  it('reset_on_instrument_change запрашивает подтверждение', async () => {
    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);
    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));

    // Смена инструмента — печатаем новый поиск
    const searchInput = screen.getByPlaceholderText(/SBER/);
    await user.clear(searchInput);
    await user.type(searchInput, 'SBER');
    const result = await screen.findByText(/SBER — Сбербанк/);
    await user.click(result);

    expect(screen.getByTestId('reset-confirm')).toBeInTheDocument();
  });
});
