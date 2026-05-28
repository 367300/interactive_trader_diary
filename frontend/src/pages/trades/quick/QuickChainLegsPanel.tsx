import { Button } from '@/components/ui/button';
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
    <aside style={{ minWidth: 300, padding: 12 }} data-testid="legs-panel">
      <h2>Legs ({legs.length})</h2>
      <ol>
        {legs.map((leg, idx) => (
          <li
            key={leg.localId}
            data-testid={`leg-${idx}`}
            style={errorsByIndex[idx] ? { color: 'red' } : undefined}
          >
            <strong>{TYPE_LABEL[leg.type]}</strong>{' '}
            {formatDate(leg.time)} {leg.price.toFixed(2)}{' '}
            <label>
              Объём%
              <input
                type="number"
                min={1}
                max={100}
                value={leg.volume_from_capital}
                onChange={(e) => onVolumeChange(leg.localId, Number(e.target.value))}
                data-testid={`leg-${idx}-volume`}
                style={{ width: 60 }}
              />
            </label>
            <button onClick={() => onRemoveLeg(leg.localId)} aria-label={`remove-${idx}`}>
              ×
            </button>
            {errorsByIndex[idx] && <em>{errorsByIndex[idx]}</em>}
          </li>
        ))}
      </ol>

      <Button onClick={onSave} disabled={!canSave} data-testid="save-chain">
        Сохранить цепочку
      </Button>
      <Button onClick={onReset} variant="ghost" data-testid="reset-chain">
        Сбросить
      </Button>
    </aside>
  );
}
