import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { adminCandleSync } from '@/api/endpoints';
import { useCandleSyncSocket } from '@/lib/useCandleSyncSocket';
import { Button } from '@/components/ui/button';
import type { CandleSyncEvent } from '@/api/types';

export interface AdminCandleSyncButtonProps {
  ticker: string;
  market: 'stock' | 'futures';
  onProgress?: (e: CandleSyncEvent) => void;
  onSynced?: (e: CandleSyncEvent) => void;
}

export default function AdminCandleSyncButton(props: AdminCandleSyncButtonProps) {
  const { ticker, onProgress, onSynced } = props;
  const [busy, setBusy] = useState(false);
  const { state, last } = useCandleSyncSocket(ticker, {
    enabled: true,
    onProgress,
    onDone: onSynced,
  });

  async function handleClick() {
    if (state === 'running' || busy) return;
    setBusy(true);
    try {
      await adminCandleSync.start(ticker, {});
    } catch (err) {
      console.warn('sync-candles start failed', err);
    } finally {
      setBusy(false);
    }
  }

  const Icon =
    state === 'running' ? Loader2 :
    state === 'done'    ? CheckCircle2 :
    state === 'error'   ? AlertCircle :
    RefreshCw;

  const progressLabel =
    state === 'running' && last && 'done_ranges' in last
      ? `${(last as { done_ranges: number; total_ranges: number }).done_ranges}/${(last as { done_ranges: number; total_ranges: number }).total_ranges}`
      : null;

  const title =
    state === 'running'
      ? progressLabel ?? 'Загрузка...'
      : state === 'done'
      ? 'Готово'
      : state === 'error'
      ? 'Ошибка'
      : 'Догрузить свечи';

  return (
    <Button
      size="sm"
      variant="default"
      onClick={handleClick}
      disabled={state === 'running' || busy}
      data-state={state}
      title={title}
      className="gap-2"
    >
      <Icon className={`h-4 w-4 ${state === 'running' ? 'animate-spin' : ''}`} />
      {progressLabel && (
        <span className="text-xs tabular-nums">{progressLabel}</span>
      )}
      {state === 'idle' && <span className="text-xs">Догрузить</span>}
    </Button>
  );
}
