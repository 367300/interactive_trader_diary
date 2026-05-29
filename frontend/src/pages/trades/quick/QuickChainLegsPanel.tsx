import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { ChainLeg } from './types';

interface Props {
  legs: ChainLeg[];
  errorsByIndex?: Record<number, string>;
  canSave: boolean;
  onVolumeChange: (localId: string, volume: number) => void;
  onRemoveLeg: (localId: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  OPEN: 'OPEN',
  AVERAGE: 'AVG',
  PARTIAL_CLOSE: 'PC',
  CLOSE: 'CLOSE',
};

const TYPE_COLOR: Record<string, string> = {
  OPEN: 'text-green',
  AVERAGE: 'text-blue',
  PARTIAL_CLOSE: 'text-amber',
  CLOSE: 'text-red',
};

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function QuickChainLegsPanel({
  legs,
  errorsByIndex = {},
  canSave,
  onVolumeChange,
  onRemoveLeg,
  onSave,
  onReset,
}: Props) {
  return (
    <Card data-testid="legs-panel">
      <CardHeader>
        <CardTitle>Legs ({legs.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {legs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет точек цепочки.</p>
        ) : (
          <ul className="space-y-2">
            {legs.map((leg, idx) => {
              const hasError = Boolean(errorsByIndex[idx]);
              return (
                <li
                  key={leg.localId}
                  data-testid={`leg-${idx}`}
                  // Тесты проверяют наличие `color: rgb(255, 0, 0)` в инлайн-стилях,
                  // поэтому оставляем inline-color на ошибке.
                  style={hasError ? { color: 'red' } : undefined}
                  className={cn(
                    'flex flex-col gap-2 p-3 rounded-[10px] border bg-glass-soft',
                    hasError ? 'border-red bg-red/10' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn('font-semibold', !hasError && TYPE_COLOR[leg.type])}>
                        {TYPE_LABEL[leg.type]}
                      </span>
                      <span className={cn(!hasError && 'text-muted-foreground')}>
                        {formatDate(leg.time)}
                      </span>
                      <span className={cn('font-medium', !hasError && 'text-foreground')}>
                        {leg.price.toFixed(2)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveLeg(leg.localId)}
                      aria-label={`remove-${idx}`}
                      className="h-7 w-7"
                    >
                      ×
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={cn('text-xs', !hasError && 'text-soft-foreground')}>
                      Объём%
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={leg.volume_from_capital}
                      onChange={(e) => onVolumeChange(leg.localId, Number(e.target.value))}
                      data-testid={`leg-${idx}-volume`}
                      className="h-8 w-20"
                    />
                  </div>
                  {hasError && (
                    <em className="text-xs not-italic">{errorsByIndex[idx]}</em>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={!canSave}
            data-testid="save-chain"
            className="w-full"
          >
            Сохранить цепочку
          </Button>
          <Button
            type="button"
            onClick={onReset}
            variant="ghost"
            data-testid="reset-chain"
            className="w-full"
          >
            Сбросить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
