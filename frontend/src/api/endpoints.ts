import { api } from './client';
import type {
  AnalyticsResponse,
  AuthTokens,
  CandleResponse,
  Dashboard,
  FuturesListItem,
  InstrumentDetail,
  InstrumentListItem,
  InstrumentStats,
  Paginated,
  Profile,
  Strategy,
  StrategyChoices,
  Taxonomy,
  Trade,
  TradeAnalysis,
  TradeDetail,
  TradeListItem,
  TradeScreenshot,
  TradeStats,
  User,
} from './types';

export const authApi = {
  login: (login: string, password: string) =>
    api.post<AuthTokens>('/auth/login/', { login, password }),
  register: (data: { username: string; email: string; password: string }) =>
    api.post<AuthTokens>('/auth/register/', data),
  logout: (refresh?: string) =>
    api.post('/auth/logout/', refresh ? { refresh } : undefined),
  me: () => api.get<Profile>('/auth/me/'),
  updateMe: (data: Partial<User>) => api.patch<User>('/auth/me/', data),
};

export const strategiesApi = {
  list: () => api.get<Paginated<Strategy>>('/strategies/'),
  get: (id: number) => api.get<Strategy>(`/strategies/${id}/`),
  create: (data: Partial<Strategy>) => api.post<Strategy>('/strategies/', data),
  update: (id: number, data: Partial<Strategy>) =>
    api.patch<Strategy>(`/strategies/${id}/`, data),
  remove: (id: number) => api.delete(`/strategies/${id}/`),
  choices: () => api.get<StrategyChoices>('/strategies/choices/'),
};

export interface InstrumentListParams {
  [key: string]: string | number | null | undefined;
  page?: number;
  search?: string;
  type?: 'STOCK' | 'FUTURES';
  sector?: number;
  industry_group?: number;
  industry?: number;
  sub_industry?: number;
}

export const instrumentsApi = {
  list: (params?: InstrumentListParams) =>
    api.get<Paginated<InstrumentListItem | FuturesListItem>>('/instruments/', { query: params }),
  get: (ticker: string) => api.get<InstrumentDetail>(`/instruments/${ticker}/`),
  getFutures: (ticker: string) => api.get<FuturesListItem>(`/instruments/futures/${ticker}/`),
  taxonomy: () => api.get<Taxonomy>('/instruments/taxonomy/'),
  stats: () => api.get<InstrumentStats>('/instruments/stats/'),
  candles: (ticker: string, params?: { from?: string; till?: string; interval?: number }) =>
    api.get<CandleResponse>(`/instruments/${ticker}/candles/`, { query: params }),
};

export interface ChildTradePayload {
  trade_date: string;
  price: string | number;
  commission?: string | number | null;
  planned_stop_loss?: string | number | null;
  planned_take_profit?: string | number | null;
  volume_from_capital?: number;
  analysis?: TradeAnalysis | null;
}

export const tradesApi = {
  list: (params?: { page?: number }) =>
    api.get<Paginated<TradeListItem>>('/trades/', { query: params }),
  get: (id: string) => api.get<TradeDetail>(`/trades/${id}/`),
  create: (data: Partial<Trade> & { analysis?: TradeAnalysis | null }) =>
    api.post<Trade>('/trades/', data),
  update: (id: string, data: Partial<Trade> & { analysis?: TradeAnalysis | null }) =>
    api.patch<Trade>(`/trades/${id}/`, data),
  remove: (id: string) => api.delete(`/trades/${id}/`),
  average: (id: string, data: ChildTradePayload) =>
    api.post<Trade>(`/trades/${id}/average/`, data),
  partialClose: (id: string, data: ChildTradePayload) =>
    api.post<Trade>(`/trades/${id}/partial-close/`, data),
  close: (id: string, data: ChildTradePayload) =>
    api.post<Trade>(`/trades/${id}/close/`, data),
  stats: (id: string) => api.get<TradeStats>(`/trades/${id}/stats/`),
  analytics: () => api.get<AnalyticsResponse>('/trades/analytics/'),
  chart: () => api.get<{ date: string; count: number }[]>('/trades/chart/'),
  screenshots: {
    list: (tradeId: string) =>
      api.get<TradeScreenshot[]>(`/trades/${tradeId}/screenshots/`),
    upload: (tradeId: string, file: File, description = '') => {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('description', description);
      return api.post<TradeScreenshot>(`/trades/${tradeId}/screenshots/`, fd, {
        isFormData: true,
      });
    },
    update: (tradeId: string, id: number, data: Partial<TradeScreenshot>) =>
      api.patch<TradeScreenshot>(`/trades/${tradeId}/screenshots/${id}/`, data),
    remove: (tradeId: string, id: number) =>
      api.delete(`/trades/${tradeId}/screenshots/${id}/`),
  },
};

export const coreApi = {
  dashboard: () => api.get<Dashboard>('/dashboard/'),
  loadInstruments: (data: {
    instrument_type?: string;
    update_existing?: boolean;
    limit?: number | null;
  }) => api.post<{ task_id: string; message: string }>('/admin/instruments/load/', data),
  loadCandles: (data: { year?: number }) =>
    api.post<{ task_id: string; message: string }>('/admin/candles/load/', data),
  uploadEnrichmentCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ detail: string }>('/admin/instruments/upload-csv/', fd, {
      isFormData: true,
    });
  },
  flushCache: () =>
    api.post<{ detail: string; cleared: string[] }>('/admin/flush-cache/'),
  toggleRegistration: () =>
    api.post<{ registration_enabled: boolean; detail: string }>('/admin/toggle-registration/'),
};

export const siteApi = {
  settings: () => api.get<{ registration_enabled: boolean }>('/site-settings/'),
};