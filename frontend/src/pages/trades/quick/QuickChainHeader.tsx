import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
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
    <Card>
      <CardHeader>
        <CardTitle>Цепочка</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 relative">
          <Label>Инструмент</Label>
          <Input
            type="text"
            placeholder={props.chain.instrumentTicker ?? 'SBER, GAZP...'}
            value={instrumentSearch}
            onChange={(e) => setInstrumentSearch(e.target.value)}
            autoComplete="off"
          />
          {instrumentResults.length > 0 && (
            <Card className="absolute top-full left-0 right-0 z-20 mt-1 p-1.5 max-h-60 overflow-y-auto">
              <ul className="space-y-0.5">
                {instrumentResults.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => {
                        props.onInstrumentChange(i.id, i.ticker);
                        setInstrumentSearch('');
                        setInstrumentResults([]);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-foreground hover:bg-blue/14 transition-colors"
                    >
                      {i.ticker} — {i.name}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-chain-strategy">Стратегия</Label>
          {/* Нативный <select> — тесты используют getByRole('combobox')
              и getByRole('option') без открытия выпадающего списка. */}
          <select
            id="quick-chain-strategy"
            value={props.chain.strategyId ?? ''}
            onChange={(e) => props.onStrategyChange(e.target.value ? Number(e.target.value) : null)}
            className="flex h-10 w-full rounded-[10px] border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15"
          >
            <option value="">— выберите —</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Направление</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={props.chain.direction === 'LONG' ? 'primary' : 'ghost'}
              size="sm"
              className="flex-1"
              onClick={() => props.onDirectionChange('LONG')}
            >
              LONG
            </Button>
            <Button
              type="button"
              variant={props.chain.direction === 'SHORT' ? 'primary' : 'ghost'}
              size="sm"
              className="flex-1"
              onClick={() => props.onDirectionChange('SHORT')}
            >
              SHORT
            </Button>
          </div>
        </div>

        <Separator />

        <p
          data-testid="status-label"
          className={cn(
            'text-sm rounded-[8px] px-3 py-2 bg-glass-soft border border-border',
            props.pendingLeg ? 'text-cyan' : 'text-muted-foreground',
          )}
        >
          {statusLabel}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            onClick={() => props.onStartLeg('OPEN')}
            disabled={props.hasOpen}
          >
            + Вход
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => props.onStartLeg('AVERAGE')}
            disabled={!props.hasOpen || props.canCloseExist}
          >
            + Усреднение
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => props.onStartLeg('PARTIAL_CLOSE')}
            disabled={!props.hasOpen || props.canCloseExist}
          >
            + Частичка
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => props.onStartLeg('CLOSE')}
            disabled={!props.hasOpen || props.canCloseExist}
          >
            + Закрытие
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
