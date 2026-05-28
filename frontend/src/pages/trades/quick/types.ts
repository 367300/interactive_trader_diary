export type LegType = 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE';

export type ChainLeg = {
  /** Локальный идентификатор для key и операций edit/remove. */
  localId: string;
  type: LegType;
  /** Unix seconds, как отдаёт lightweight-charts time. */
  time: number;
  price: number;
  volume_from_capital: number;
  planned_stop_loss?: number | null;
  planned_take_profit?: number | null;
};

export type PendingSubstep = 'point' | 'sl' | 'tp';

export type PendingLeg = {
  type: LegType;
  sub: PendingSubstep;
  /** Промежуточные точки во время многошагового захвата (OPEN+SL+TP). */
  draft?: Partial<ChainLeg>;
};

export type ActiveChain = {
  instrumentId: number | null;
  instrumentTicker: string | null;
  strategyId: number | null;
  direction: 'LONG' | 'SHORT';
  legs: ChainLeg[];
};

export type SavedChainSummary = {
  openTradeId: string;
  /** Точки маркеров (parent + child) для отрисовки тускло на графике. */
  markerPoints: Array<{ time: number; price: number; type: LegType }>;
};
