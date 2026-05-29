import { useCallback, useEffect, useState } from 'react';
import { QuickChainHeader } from './QuickChainHeader';
import { QuickChainChart } from './QuickChainChart';
import { QuickChainLegsPanel } from './QuickChainLegsPanel';
import { QuickChainSuccessPanel } from './QuickChainSuccessPanel';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tradesApi, type QuickChainPayload } from '@/api/endpoints';
import type {
  ActiveChain, ChainLeg, LegType, PendingLeg, SavedChainSummary,
} from './types';

const EMPTY_CHAIN: ActiveChain = {
  instrumentId: null,
  instrumentTicker: null,
  strategyId: null,
  direction: 'LONG',
  legs: [],
};

const DEFAULT_VOLUME: Record<LegType, number> = {
  OPEN: 10, AVERAGE: 10, PARTIAL_CLOSE: 10, CLOSE: 10,
};

function newId() {
  return Math.random().toString(36).slice(2, 11);
}

function nextDefaultVolume(type: LegType, legs: ChainLeg[]): number {
  if (type === 'CLOSE') {
    const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    return Math.max(1, open - closed);
  }
  if (type === 'PARTIAL_CLOSE') {
    const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    return Math.max(1, Math.floor((open - closed) / 2));
  }
  return DEFAULT_VOLUME[type];
}

export function QuickTradeEntryPage() {
  const [chain, setChain] = useState<ActiveChain>(EMPTY_CHAIN);
  const [pendingLeg, setPendingLeg] = useState<PendingLeg | null>(null);
  const [savedChains, setSavedChains] = useState<SavedChainSummary[]>([]);
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});
  const [nonFieldError, setNonFieldError] = useState<string | null>(null);
  const [successChainId, setSuccessChainId] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<null | (() => void)>(null);

  const hasOpen = chain.legs.some((l) => l.type === 'OPEN');
  const hasClose = chain.legs.some((l) => l.type === 'CLOSE');
  const canSave = hasOpen && hasClose && computeVolumeBalance(chain.legs) === 0;

  // Загрузка прошлых цепочек на тикер
  useEffect(() => {
    if (!chain.instrumentId) {
      setSavedChains([]);
      return;
    }
    tradesApi.list({ instrument: chain.instrumentId, is_closed: true } as any)
      .then((r: any) => {
        const items = r.results ?? r;
        Promise.all(items.map((t: any) => tradesApi.get(t.id))).then((details: any[]) => {
          setSavedChains(details.map((d) => ({
            openTradeId: d.id,
            markerPoints: [
              { time: Math.floor(new Date(d.trade_date).getTime() / 1000), price: Number(d.price), type: 'OPEN' as LegType },
              ...(d.child_trades ?? []).map((c: any) => ({
                time: Math.floor(new Date(c.trade_date).getTime() / 1000),
                price: Number(c.price),
                type: c.trade_type as LegType,
              })),
            ],
          })));
        });
      });
  }, [chain.instrumentId]);

  const requestReset = useCallback((thenDo: () => void) => {
    if (chain.legs.length === 0) {
      thenDo();
    } else {
      setResetConfirm(() => thenDo);
    }
  }, [chain.legs.length]);

  const handleInstrumentChange = (id: number | null, ticker: string | null) => {
    requestReset(() => {
      setChain((c) => ({
        ...EMPTY_CHAIN,
        instrumentId: id,
        instrumentTicker: ticker,
        strategyId: c.strategyId,
        direction: c.direction,
      }));
      setPendingLeg(null);
      setErrorsByIndex({});
      setNonFieldError(null);
    });
  };

  const handleStartLeg = (type: LegType) => {
    setPendingLeg({ type, sub: 'point' });
  };

  const handlePointPick = (point: { time: number; price: number }) => {
    if (!pendingLeg) return;
    const { type, sub, draft } = pendingLeg;

    if (type === 'OPEN' && sub === 'point') {
      setPendingLeg({ type, sub: 'sl', draft: { type, time: point.time, price: point.price } });
      return;
    }
    if (type === 'OPEN' && sub === 'sl') {
      setPendingLeg({ type, sub: 'tp', draft: { ...draft, planned_stop_loss: point.price } });
      return;
    }
    if (type === 'OPEN' && sub === 'tp') {
      const leg: ChainLeg = {
        localId: newId(),
        type: 'OPEN',
        time: draft!.time!,
        price: draft!.price!,
        volume_from_capital: DEFAULT_VOLUME.OPEN,
        planned_stop_loss: draft!.planned_stop_loss ?? null,
        planned_take_profit: point.price,
      };
      setChain((c) => ({ ...c, legs: [...c.legs, leg] }));
      setPendingLeg(null);
      return;
    }

    const leg: ChainLeg = {
      localId: newId(),
      type,
      time: point.time,
      price: point.price,
      volume_from_capital: nextDefaultVolume(type, chain.legs),
    };
    setChain((c) => ({ ...c, legs: [...c.legs, leg] }));
    setPendingLeg(null);
  };

  const handleVolumeChange = (localId: string, volume: number) => {
    setChain((c) => ({
      ...c,
      legs: c.legs.map((l) => (l.localId === localId ? { ...l, volume_from_capital: volume } : l)),
    }));
  };

  const handleRemoveLeg = (localId: string) => {
    setChain((c) => ({ ...c, legs: c.legs.filter((l) => l.localId !== localId) }));
  };

  const handleSave = async () => {
    setErrorsByIndex({});
    setNonFieldError(null);
    if (!chain.instrumentId || !chain.strategyId) return;
    const payload: QuickChainPayload = {
      instrument_id: chain.instrumentId,
      strategy_id: chain.strategyId,
      direction: chain.direction,
      legs: chain.legs.map((l) => ({
        type: l.type,
        date: new Date(l.time * 1000).toISOString(),
        price: l.price.toFixed(2),
        volume_from_capital: l.volume_from_capital,
        planned_stop_loss: l.planned_stop_loss != null ? Number(l.planned_stop_loss).toFixed(2) : null,
        planned_take_profit: l.planned_take_profit != null ? Number(l.planned_take_profit).toFixed(2) : null,
      })),
    };
    try {
      const result = await tradesApi.createQuickChain(payload);
      setSuccessChainId(result.chain_id);
      setSavedChains((prev) => [
        {
          openTradeId: result.chain_id,
          markerPoints: chain.legs.map((l) => ({ time: l.time, price: l.price, type: l.type })),
        },
        ...prev,
      ]);
      setChain((c) => ({
        ...EMPTY_CHAIN,
        instrumentId: c.instrumentId,
        instrumentTicker: c.instrumentTicker,
        strategyId: c.strategyId,
        direction: c.direction,
      }));
    } catch (err: any) {
      const data = err?.response?.data ?? err?.body ?? {};
      if (Array.isArray(data.legs)) {
        const errs: Record<number, string> = {};
        data.legs.forEach((legErr: any, idx: number) => {
          if (legErr && typeof legErr === 'object') {
            const firstKey = Object.keys(legErr)[0];
            if (firstKey) errs[idx] = String(legErr[firstKey]);
          }
        });
        setErrorsByIndex(errs);
      }
      if (data.non_field_errors) {
        setNonFieldError(String(data.non_field_errors[0] ?? data.non_field_errors));
      } else if (typeof data === 'string') {
        setNonFieldError(data);
      } else if (data.detail) {
        setNonFieldError(String(data.detail));
      } else if (!Array.isArray(data.legs)) {
        setNonFieldError('Не удалось сохранить цепочку. Попробуйте ещё раз.');
      }
    }
  };

  return (
    <section>
      <h1>Быстрый ввод цепочек сделок</h1>

      {nonFieldError && (
        <Alert
          variant="destructive"
          className="mb-4"
          data-testid="non-field-error"
        >
          {nonFieldError}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
        <QuickChainHeader
          chain={chain}
          pendingLeg={pendingLeg}
          canCloseExist={hasClose}
          hasOpen={hasOpen}
          onInstrumentChange={handleInstrumentChange}
          onStrategyChange={(id) => setChain((c) => ({ ...c, strategyId: id }))}
          onDirectionChange={(d) => setChain((c) => ({ ...c, direction: d }))}
          onStartLeg={handleStartLeg}
        />
        {chain.instrumentTicker ? (
          <QuickChainChart
            ticker={chain.instrumentTicker}
            activeLegs={chain.legs}
            savedChains={savedChains}
            enablePicker={pendingLeg !== null}
            onPointPick={handlePointPick}
          />
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-20 text-center text-muted-foreground">
              Выберите инструмент чтобы открыть график
            </CardContent>
          </Card>
        )}
        <QuickChainLegsPanel
          legs={chain.legs}
          errorsByIndex={errorsByIndex}
          canSave={canSave}
          onVolumeChange={handleVolumeChange}
          onRemoveLeg={handleRemoveLeg}
          onSave={handleSave}
          onReset={() => requestReset(() => setChain((c) => ({ ...c, legs: [] })))}
        />
      </div>

      {successChainId && (
        <QuickChainSuccessPanel
          chainId={successChainId}
          onNextChain={() => setSuccessChainId(null)}
          onClose={() => setSuccessChainId(null)}
        />
      )}

      <Dialog
        open={resetConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setResetConfirm(null);
        }}
      >
        <DialogContent data-testid="reset-confirm" aria-label="Подтвердите сброс">
          <DialogHeader>
            <DialogTitle>Сбросить незавершённую цепочку?</DialogTitle>
            <DialogDescription>
              Все добавленные шаги будут удалены. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setResetConfirm(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="reset-confirm-yes"
              onClick={() => {
                if (resetConfirm) resetConfirm();
                setResetConfirm(null);
              }}
            >
              Да, сбросить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function computeVolumeBalance(legs: ChainLeg[]): number {
  const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
    .reduce((s, l) => s + l.volume_from_capital, 0);
  const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
    .reduce((s, l) => s + l.volume_from_capital, 0);
  return open - closed;
}
