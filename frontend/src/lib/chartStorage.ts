import type { SerializedDrawing } from 'lightweight-charts-drawing';

interface ChartSettings {
  interval: number;
  rangeIdx: number;
  drawings: SerializedDrawing[];
}

const STORAGE_KEY = 'chart_settings';

function getKey(ticker: string): string {
  return `${STORAGE_KEY}:${ticker}`;
}

export function loadChartSettings(ticker: string): Partial<ChartSettings> {
  try {
    const raw = localStorage.getItem(getKey(ticker));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ChartSettings>;
  } catch {
    return {};
  }
}

export function saveChartSettings(
  ticker: string,
  settings: Partial<ChartSettings>,
): void {
  try {
    const existing = loadChartSettings(ticker);
    const merged = { ...existing, ...settings };
    localStorage.setItem(getKey(ticker), JSON.stringify(merged));
  } catch {
    // localStorage full or unavailable
  }
}

export function saveDrawings(
  ticker: string,
  drawings: SerializedDrawing[],
): void {
  saveChartSettings(ticker, { drawings });
}

export function loadDrawings(ticker: string): SerializedDrawing[] {
  const settings = loadChartSettings(ticker);
  return settings.drawings ?? [];
}
