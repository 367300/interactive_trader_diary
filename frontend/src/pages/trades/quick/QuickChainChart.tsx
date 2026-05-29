import { useMemo } from 'react';
import CandlestickChart, { type ChartMarker } from '@/components/CandlestickChart';
import type { ChainLeg, SavedChainSummary } from './types';

interface Props {
  ticker: string;
  activeLegs: ChainLeg[];
  savedChains: SavedChainSummary[];
  enablePicker: boolean;
  onPointPick: (point: { time: number; price: number }) => void;
}

const LEG_COLOR: Record<string, string> = {
  OPEN: '#2563eb',
  AVERAGE: '#0891b2',
  PARTIAL_CLOSE: '#f59e0b',
  CLOSE: '#16a34a',
};

const LEG_SHAPE: Record<string, ChartMarker['shape']> = {
  OPEN: 'arrowUp',
  AVERAGE: 'circle',
  PARTIAL_CLOSE: 'square',
  CLOSE: 'arrowDown',
};

export function QuickChainChart({ ticker, activeLegs, savedChains, enablePicker, onPointPick }: Props) {
  const markers = useMemo<ChartMarker[]>(() => {
    const active: ChartMarker[] = activeLegs.map((leg) => ({
      time: leg.time,
      position: leg.type === 'OPEN' || leg.type === 'AVERAGE' ? 'belowBar' : 'aboveBar',
      color: LEG_COLOR[leg.type],
      shape: LEG_SHAPE[leg.type],
      text: leg.type[0],
    }));

    const dim: ChartMarker[] = savedChains.flatMap((chain) =>
      chain.markerPoints.map((p) => ({
        time: p.time,
        position: p.type === 'OPEN' || p.type === 'AVERAGE' ? 'belowBar' : 'aboveBar',
        color: LEG_COLOR[p.type] + '55', // ~33% alpha
        shape: LEG_SHAPE[p.type],
      }))
    );

    return [...dim, ...active].sort((a, b) => a.time - b.time);
  }, [activeLegs, savedChains]);

  return (
    <div style={{ flex: 1 }}>
      <CandlestickChart
        ticker={ticker}
        markers={markers}
        pickerMode={enablePicker}
        onPointPick={onPointPick}
      />
    </div>
  );
}
