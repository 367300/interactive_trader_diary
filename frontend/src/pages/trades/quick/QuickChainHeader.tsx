import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { instrumentsApi, strategiesApi } from '@/api/endpoints';
import type { ActiveChain, PendingLeg } from './types';

interface Props {
  chain: ActiveChain;
  pendingLeg: PendingLeg | null;
  canCloseExist: boolean;
  hasOpen: boolean;
  onInstrumentChange: (id: number | null, ticker: string | null) => void;
  onStrategyChange: (id: number | null) => void;
  onDirectionChange: (dir: 'LONG' | 'SHORT') => void;
  onStartLeg: (type: 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE') => void;
}

type InstrumentSuggestion = { id: number; ticker: string; name: string };

export function QuickChainHeader(props: Props) {
  const [strategies, setStrategies] = useState<Array<{ id: number; name: string }>>([]);
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [instrumentResults, setInstrumentResults] = useState<InstrumentSuggestion[]>([]);

  useEffect(() => {
    strategiesApi.list().then((r) => {
      setStrategies(r.results.map((s) => ({ id: s.id, name: s.name })));
    });
  }, []);

  useEffect(() => {
    if (!instrumentSearch) {
      setInstrumentResults([]);
      return;
    }
    const t = setTimeout(() => {
      instrumentsApi.list({ search: instrumentSearch }).then((r) => {
        setInstrumentResults(
          r.results.map((i) => ({ id: i.id, ticker: i.ticker, name: i.name })),
        );
      });
    }, 200);
    return () => clearTimeout(t);
  }, [instrumentSearch]);

  const statusLabel = (() => {
    if (!props.chain.instrumentId) return 'Выберите инструмент';
    if (!props.chain.strategyId) return 'Выберите стратегию';
    if (!props.pendingLeg) {
      if (!props.hasOpen) return 'Нажмите [+ Вход]';
      return 'Выберите следующий шаг';
    }
    const labels: Record<string, string> = {
      OPEN: 'Жду точку входа',
      AVERAGE: 'Жду точку усреднения',
      PARTIAL_CLOSE: 'Жду точку частичного закрытия',
      CLOSE: 'Жду точку закрытия',
    };
    const subLabels: Record<string, string> = {
      point: '',
      sl: ' → клик SL',
      tp: ' → клик TP',
    };
    return labels[props.pendingLeg.type] + subLabels[props.pendingLeg.sub];
  })();

  return (
    <aside style={{ minWidth: 240, padding: 12 }}>
      <h2>Цепочка</h2>

      <label>Инструмент</label>
      <input
        type="text"
        placeholder={props.chain.instrumentTicker ?? 'SBER, GAZP...'}
        value={instrumentSearch}
        onChange={(e) => setInstrumentSearch(e.target.value)}
      />
      {instrumentResults.length > 0 && (
        <ul>
          {instrumentResults.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => {
                  props.onInstrumentChange(i.id, i.ticker);
                  setInstrumentSearch('');
                  setInstrumentResults([]);
                }}
              >
                {i.ticker} — {i.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label>Стратегия</label>
      <select
        value={props.chain.strategyId ?? ''}
        onChange={(e) => props.onStrategyChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— выберите —</option>
        {strategies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label>Направление</label>
      <div>
        <label>
          <input
            type="radio"
            name="dir"
            checked={props.chain.direction === 'LONG'}
            onChange={() => props.onDirectionChange('LONG')}
          />
          LONG
        </label>
        <label>
          <input
            type="radio"
            name="dir"
            checked={props.chain.direction === 'SHORT'}
            onChange={() => props.onDirectionChange('SHORT')}
          />
          SHORT
        </label>
      </div>

      <hr />
      <p data-testid="status-label">{statusLabel}</p>

      <Button onClick={() => props.onStartLeg('OPEN')} disabled={props.hasOpen}>
        + Вход
      </Button>
      <Button onClick={() => props.onStartLeg('AVERAGE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Усреднение
      </Button>
      <Button onClick={() => props.onStartLeg('PARTIAL_CLOSE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Частичка
      </Button>
      <Button onClick={() => props.onStartLeg('CLOSE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Закрытие
      </Button>
    </aside>
  );
}
