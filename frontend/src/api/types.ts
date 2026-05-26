export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  user: User;
}

export interface ProfileStats {
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  active_strategies: number;
}

export interface Profile {
  user: User;
  created_at: string;
  updated_at: string;
  stats: ProfileStats;
}

export interface Choice<T = string> {
  value: T;
  label: string;
}

export interface StrategyChoices {
  strategy_types: Choice[];
  instruments: Choice[];
}

export type StrategyType = 'SCALPING' | 'DAY_TRADING' | 'SWING' | 'POSITION';
export type StrategyInstruments = 'STOCKS' | 'FUTURES' | 'BOTH';

export interface Strategy {
  id: number;
  name: string;
  description: string;
  strategy_type: StrategyType;
  strategy_type_display: string;
  instruments: StrategyInstruments;
  instruments_display: string;
  is_active: boolean;
  trades_count: number;
  closed_trades_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaxonomyPath {
  sector: string | null;
  industry_group: string | null;
  industry: string | null;
  sub_industry: string | null;
}

export type InstrumentType = 'STOCK' | 'INDEX' | 'BOND' | 'ETF' | 'CURRENCY';

export interface InstrumentListItem {
  id: number;
  ticker: string;
  name: string;
  instrument_type: InstrumentType;
  instrument_type_display: string;
  sector: string;
  description: string;
  lot_size: number;
  min_price_step: string;
  currency: string;
  is_active: boolean;
  logo_url: string | null;
  og_logo_url: string | null;
  trades_count: number;
  closed_trades_count: number;
  taxonomy: TaxonomyPath;
}

export interface FuturesShort {
  id: number;
  ticker: string;
  name: string;
  expiration_date: string | null;
  currency: string;
  min_price_step: string | null;
  lot_size: number | null;
}

export interface InstrumentDetail extends InstrumentListItem {
  futures: FuturesShort[];
}

export interface FuturesListItem {
  id: number;
  ticker: string;
  name: string;
  expiration_date: string | null;
  currency: string;
  is_active: boolean;
  min_price_step: string | null;
  lot_size: number | null;
  base_asset_id: number;
  base_asset_ticker: string;
  base_asset_name: string;
  logo_url: string | null;
  og_logo_url: string | null;
  taxonomy: TaxonomyPath;
  trades_count: number;
  closed_trades_count: number;
}

export interface Taxonomy {
  sectors: { id: number; name: string }[];
  industry_groups: { id: number; name: string; sector_id: number }[];
  industries: { id: number; name: string; industry_group_id: number }[];
  sub_industries: { id: number; name: string; industry_id: number }[];
}

export type Direction = 'LONG' | 'SHORT';
export type TradeType = 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE';
export type EmotionalState = 'CALM' | 'EXCITED' | 'FEARFUL' | 'GREEDY' | 'CONFIDENT' | '';

export interface TradeAnalysis {
  analysis: string;
  conclusions: string;
  emotional_state: EmotionalState;
  emotional_state_display?: string;
  tags: string[];
}

export interface TradeScreenshot {
  id: number;
  image_url: string;
  description: string;
  uploaded_at: string;
}

export interface InstrumentBrief {
  id: number;
  ticker: string;
  name: string;
  min_price_step: string;
  lot_size: number;
  currency: string;
}

export interface StrategyBrief {
  id: number;
  name: string;
}

export interface TradeListItem {
  id: string;
  strategy_detail: StrategyBrief | null;
  instrument_detail: InstrumentBrief;
  trade_date: string;
  direction: Direction;
  direction_display: string;
  trade_type: TradeType;
  trade_type_display: string;
  price: string;
  volume_from_capital: number;
  parent_trade: string | null;
  pips_result: number | null;
  is_closed: boolean;
  available_volume: number;
  created_at: string;
}

export interface TradeStats {
  total_trades: number;
  averages_count: number;
  partial_closes_count: number;
  is_closed: boolean;
  direction: Direction;
  avg_stop: string | null;
  avg_take: string | null;
  pips: number | null;
  entry_price: string;
  close_price: string | null;
  multiplier: number | null;
}

export interface Trade extends TradeListItem {
  user: number;
  strategy: number | null;
  instrument: number;
  commission: string | null;
  planned_stop_loss: string | null;
  planned_take_profit: string | null;
  analysis: TradeAnalysis | null;
  screenshots: TradeScreenshot[];
  updated_at: string;
}

export interface TradeDetail extends Trade {
  child_trades: Trade[];
  stats: TradeStats | null;
}

export interface AggregateStats {
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  total_pnl_pips: number;
  win_rate: number;
  avg_trade_pips: number;
  win_count: number;
  loss_count: number;
}

export interface Dashboard {
  aggregate: AggregateStats;
  recent_trades: TradeListItem[];
  active_strategies: { id: number; name: string; strategy_type: string; instruments: string }[];
}

export interface InstrumentStats {
  total_instruments: number;
  used_instruments: number;
  total_trades: number;
  closed_trades: number;
  top_instruments: {
    ticker: string;
    name: string;
    trades_count: number;
    closed_trades_count: number;
  }[];
  type_distribution: { type: string; label: string; count: number }[];
}

export interface AnalyticsResponse {
  aggregate: AggregateStats;
  strategies: { id: number; name: string; trades_count: number }[];
  instruments: { id: number; ticker: string; name: string; trades_count: number }[];
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleResponse {
  ticker: string;
  interval: number;
  from: string;
  till: string;
  count: number;
  candles: CandleData[];
}
