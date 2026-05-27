import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { instrumentsApi } from '../api/endpoints';
import type { CandleData } from '../api/types';
import { getInitialDateRange, getEarlierDateRange } from '@/lib/candleChunks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Alert } from './ui/alert';

const INTERVALS = [
  { value: 1, label: '1м' },
  { value: 5, label: '5м' },
  { value: 15, label: '15м' },
  { value: 60, label: '1ч' },
  { value: 240, label: '4ч' },
  { value: 1440, label: '1д' },
] as const;

interface SelectedPoint {
  time: number;
  price: number;
}

interface ChartPricePickerProps {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (date: string, price: string) => void;
  minDate?: string;
}

// lightweight-charts мутирует timestamps в setData(), добавляя offset
// браузера. Поэтому candle.time и param.time уже содержат локальное время
// в формате UTC. Используем getUTC* без дополнительного смещения.
function timestampToDatetimeLocal(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatDisplayDate(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatPrice(price: number): string {
  return price.toFixed(2);
}

function ChartPickerContent({
  ticker,
  onApply,
  minDate,
}: {
  ticker: string;
  onApply: (date: string, price: string) => void;
  minDate?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candleDataRef = useRef<CandlestickData<Time>[]>([]);
  const volumeDataRef = useRef<HistogramData<Time>[]>([]);
  const isLoadingMoreRef = useRef(false);
  const earliestLoadedDateRef = useRef<string | null>(null);

  const [interval, setInterval] = useState(1440);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  const minFromDate = minDate ? minDate.slice(0, 10) : null;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.6)',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255, 255, 255, 0.2)', labelBackgroundColor: '#2a2e39' },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)', labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const seriesMarkers = createSeriesMarkers(candleSeries);
    markersRef.current = seriesMarkers;

    chart.subscribeClick((param) => {
      if (!param.time || !param.point) return;

      const candle = candleDataRef.current.find((c) => c.time === param.time);
      if (!candle) return;

      const cursorPrice = candleSeries.coordinateToPrice(param.point.y);
      if (cursorPrice === null) return;

      const price = cursorPrice as number;
      const candleTime = candle.time as number;
      const high = candle.high as number;
      const low = candle.low as number;
      const markerPrice = Math.max(low, Math.min(high, price));

      setSelected({ time: candleTime, price });

      seriesMarkers.setMarkers([
        {
          time: candle.time,
          position: 'atPriceBottom',
          price: markerPrice,
          color: '#5a8cff',
          shape: 'arrowUp',
          text: '',
        },
      ]);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && range.from < 0 && earliestLoadedDateRef.current && !isLoadingMoreRef.current) {
        void loadMore();
      }
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (isLoadingMoreRef.current || !earliestLoadedDateRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const { from, till } = getEarlierDateRange(earliestLoadedDateRef.current, interval);
      const res = await instrumentsApi.candles(ticker, { from, till, interval });
      if (!res.candles.length) { earliestLoadedDateRef.current = null; return; }

      const existingTimes = new Set(candleDataRef.current.map((c) => c.time as number));
      const newCandles: CandlestickData<Time>[] = [];
      const newVolume: HistogramData<Time>[] = [];
      for (const c of res.candles) {
        if (existingTimes.has(c.time)) continue;
        newCandles.push({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close });
        newVolume.push({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)' });
      }
      if (!newCandles.length) { earliestLoadedDateRef.current = null; return; }

      const visibleRange = chartRef.current?.timeScale().getVisibleRange();
      candleDataRef.current = [...newCandles, ...candleDataRef.current];
      volumeDataRef.current = [...newVolume, ...volumeDataRef.current];
      candleSeriesRef.current?.setData(candleDataRef.current);
      volumeSeriesRef.current?.setData(volumeDataRef.current);
      if (visibleRange) { try { chartRef.current?.timeScale().setVisibleRange(visibleRange); } catch { /* */ } }
      earliestLoadedDateRef.current = from;
    } finally {
      isLoadingMoreRef.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    const initRange = getInitialDateRange(interval);
    const from = minFromDate && minFromDate > initRange.from ? minFromDate : initRange.from;
    const till = initRange.till;

    setLoading(true);
    setError(null);
    setNoData(false);
    setSelected(null);
    markersRef.current?.setMarkers([]);
    earliestLoadedDateRef.current = from;

    instrumentsApi
      .candles(ticker, { from, till, interval })
      .then((res) => {
        if (cancelled) return;
        if (!res.candles.length) {
          setNoData(true);
          setLoading(false);
          return;
        }

        const candleData: CandlestickData<Time>[] = res.candles.map((c: CandleData) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const volumeData: HistogramData<Time>[] = res.candles.map((c: CandleData) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }));

        candleDataRef.current = candleData;
        volumeDataRef.current = volumeData;
        candleSeriesRef.current?.setData(candleData);
        volumeSeriesRef.current?.setData(volumeData);
        chartRef.current?.timeScale().fitContent();
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, interval, minFromDate]);

  const handleApply = () => {
    if (!selected) return;
    onApply(timestampToDatetimeLocal(selected.time), formatPrice(selected.price));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Выбор цены на графике — {ticker}</DialogTitle>
        <DialogDescription>
          Кликните в точку входа — цена берётся с перекрестия, время с открытия свечи
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-0.5 mt-2">
        {INTERVALS.map((iv) => (
          <button
            key={iv.value}
            onClick={() => setInterval(iv.value)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              interval === iv.value
                ? 'bg-blue/20 text-blue border border-blue/30'
                : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground'
            }`}
          >
            {iv.label}
          </button>
        ))}
      </div>

      {interval > 1 && (
        <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-blue/10 border border-blue/20 text-xs text-blue">
          Для точного определения времени сделки рекомендуется использовать минутный таймфрейм (1м)
        </div>
      )}

      {error && <Alert variant="destructive" className="mt-2">{error}</Alert>}
      {noData && !loading && (
        <Alert className="mt-2">Нет данных по инструменту {ticker}.</Alert>
      )}

      <div className="relative rounded-xl border border-border bg-glass-soft overflow-hidden mt-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <span className="text-sm text-muted-foreground">Загрузка графика...</span>
          </div>
        )}
        <div ref={containerRef} style={{ height: 400 }} />
      </div>

      {selected && (
        <div className="mt-3 p-3 rounded-lg border border-border bg-glass-soft">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-muted-foreground">Дата и время</div>
              <div className="text-sm font-medium">{formatDisplayDate(selected.time)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Цена</div>
              <div className="text-sm font-medium">{formatPrice(selected.price)}</div>
            </div>
          </div>
        </div>
      )}

      <DialogFooter className="mt-4">
        <Button variant="primary" disabled={!selected} onClick={handleApply}>
          Применить
        </Button>
      </DialogFooter>
    </>
  );
}

export default function ChartPricePickerDialog({
  ticker,
  open,
  onOpenChange,
  onApply,
  minDate,
}: ChartPricePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {open && (
          <ChartPickerContent
            ticker={ticker}
            onApply={(date, price) => {
              onApply(date, price);
              onOpenChange(false);
            }}
            minDate={minDate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
