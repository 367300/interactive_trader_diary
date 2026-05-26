import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
} from 'lightweight-charts';
import { instrumentsApi } from '../api/endpoints';
import type { CandleData } from '../api/types';
import { Alert } from '@/components/ui/alert';

const INTERVALS = [
  { value: 1, label: '1м' },
  { value: 5, label: '5м' },
  { value: 15, label: '15м' },
  { value: 30, label: '30м' },
  { value: 60, label: '1ч' },
  { value: 240, label: '4ч' },
  { value: 1440, label: '1д' },
] as const;

const RANGES = [
  { label: '1д', days: 1, defaultInterval: 1 },
  { label: '1н', days: 7, defaultInterval: 5 },
  { label: '1м', days: 30, defaultInterval: 15 },
  { label: '3м', days: 90, defaultInterval: 60 },
  { label: '6м', days: 180, defaultInterval: 240 },
  { label: 'YTD', days: 0, defaultInterval: 1440 },
] as const;

interface Props {
  ticker: string;
}

export default function CandlestickChart({ ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [interval, setInterval] = useState(5);
  const [rangeIdx, setRangeIdx] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);

  const getDateRange = useCallback(() => {
    const range = RANGES[rangeIdx];
    const till = new Date();
    const from = new Date();
    if (range.days === 0) {
      from.setMonth(0, 1);
    } else {
      from.setDate(from.getDate() - range.days);
    }
    return {
      from: from.toISOString().slice(0, 10),
      till: till.toISOString().slice(0, 10),
    };
  }, [rangeIdx]);

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
        vertLine: { color: 'rgba(255, 255, 255, 0.2)', labelBackgroundColor: '#2a2e39' },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)', labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
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

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { from, till } = getDateRange();

    setLoading(true);
    setError(null);
    setNoData(false);

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

    return () => { cancelled = true; };
  }, [ticker, interval, getDateRange]);

  const onRangeChange = (idx: number) => {
    setRangeIdx(idx);
    setInterval(RANGES[idx].defaultInterval);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <div className="flex items-center gap-0.5 mr-3">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => onRangeChange(i)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                rangeIdx === i
                  ? 'bg-blue/20 text-blue border border-blue/30'
                  : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
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
      </div>

      {error && <Alert variant="destructive" className="mb-2">{error}</Alert>}
      {noData && !loading && (
        <Alert className="mb-2">
          Нет данных для построения графика. Загрузите котировки в разделе «Загрузка данных».
        </Alert>
      )}

      <div className="relative rounded-xl border border-border bg-glass-soft overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <span className="text-sm text-muted-foreground">Загрузка графика...</span>
          </div>
        )}
        <div ref={containerRef} style={{ height: 500 }} />
      </div>
    </div>
  );
}
