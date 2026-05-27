import { useEffect, useRef, useState, useCallback } from 'react';
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
  type SeriesMarker,
} from 'lightweight-charts';
import {
  DrawingManager,
  LongPosition,
  ShortPosition,
  type Anchor,
} from 'lightweight-charts-drawing';
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
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert } from './ui/alert';

const INTERVALS = [
  { value: 1, label: '1м' },
  { value: 5, label: '5м' },
  { value: 15, label: '15м' },
  { value: 60, label: '1ч' },
  { value: 240, label: '4ч' },
  { value: 1440, label: '1д' },
] as const;

const POSITION_VIS_KEY = 'chart_picker_show_position';

type SelectionStep = 'entry' | 'stop_loss' | 'take_profit' | 'done';
type SlTpMode = 'pending' | 'manual' | 'auto' | 'skip';

interface SelectedPoint {
  time: number;
  price: number;
}

interface ChartPricePickerProps {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (date: string, price: string, stopLoss?: string, takeProfit?: string) => void;
  minDate?: string;
  direction?: 'LONG' | 'SHORT';
}

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

let drawingIdCounter = Date.now();
function nextDrawingId(): string {
  return `picker-${++drawingIdCounter}`;
}

function ChartPickerContent({
  ticker,
  onApply,
  minDate,
  direction = 'LONG',
}: {
  ticker: string;
  onApply: (date: string, price: string, stopLoss?: string, takeProfit?: string) => void;
  minDate?: string;
  direction?: 'LONG' | 'SHORT';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const positionDrawingIdRef = useRef<string | null>(null);
  const candleDataRef = useRef<CandlestickData<Time>[]>([]);
  const volumeDataRef = useRef<HistogramData<Time>[]>([]);
  const isLoadingMoreRef = useRef(false);
  const earliestLoadedDateRef = useRef<string | null>(null);

  const [interval, setInterval] = useState(1440);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);

  const [step, setStep] = useState<SelectionStep>('entry');
  const [slTpMode, setSlTpMode] = useState<SlTpMode>('pending');
  const [entryPoint, setEntryPoint] = useState<SelectedPoint | null>(null);
  const [stopLossPoint, setStopLossPoint] = useState<SelectedPoint | null>(null);
  const [takeProfitPoint, setTakeProfitPoint] = useState<SelectedPoint | null>(null);

  const [autoSlPercent, setAutoSlPercent] = useState('0.5');
  const [autoTpPercent, setAutoTpPercent] = useState('1.0');

  const [showPositionVis, setShowPositionVis] = useState(() => {
    const saved = localStorage.getItem(POSITION_VIS_KEY);
    return saved !== 'false';
  });

  const stepRef = useRef(step);
  stepRef.current = step;
  const slTpModeRef = useRef(slTpMode);
  slTpModeRef.current = slTpMode;
  const entryPointRef = useRef(entryPoint);
  entryPointRef.current = entryPoint;
  const stopLossPointRef = useRef(stopLossPoint);
  stopLossPointRef.current = stopLossPoint;

  const minFromDate = minDate ? minDate.slice(0, 10) : null;

  const autoSlPrice = entryPoint
    ? direction === 'LONG'
      ? entryPoint.price * (1 - parseFloat(autoSlPercent || '0') / 100)
      : entryPoint.price * (1 + parseFloat(autoSlPercent || '0') / 100)
    : null;

  const autoTpPrice = entryPoint
    ? direction === 'LONG'
      ? entryPoint.price * (1 + parseFloat(autoTpPercent || '0') / 100)
      : entryPoint.price * (1 - parseFloat(autoTpPercent || '0') / 100)
    : null;

  const togglePositionVis = useCallback(() => {
    setShowPositionVis((prev) => {
      const next = !prev;
      localStorage.setItem(POSITION_VIS_KEY, String(next));
      return next;
    });
  }, []);

  const updateMarkers = useCallback((
    entry: SelectedPoint | null,
    sl: SelectedPoint | null,
    tp: SelectedPoint | null,
  ) => {
    if (!markersRef.current) return;
    const markers: SeriesMarker<Time>[] = [];

    if (entry) {
      const candle = candleDataRef.current.find((c) => c.time === (entry.time as Time));
      const high = candle ? (candle.high as number) : entry.price;
      const low = candle ? (candle.low as number) : entry.price;
      markers.push({
        time: entry.time as Time,
        position: 'atPriceBottom',
        price: Math.max(low, Math.min(high, entry.price)),
        color: '#5a8cff',
        shape: 'arrowUp',
        text: 'Вход',
      });
    }

    if (sl) {
      const candle = candleDataRef.current.find((c) => c.time === (sl.time as Time));
      const high = candle ? (candle.high as number) : sl.price;
      const low = candle ? (candle.low as number) : sl.price;
      markers.push({
        time: sl.time as Time,
        position: 'atPriceBottom',
        price: Math.max(low, Math.min(high, sl.price)),
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'SL',
      });
    }

    if (tp) {
      const candle = candleDataRef.current.find((c) => c.time === (tp.time as Time));
      const high = candle ? (candle.high as number) : tp.price;
      const low = candle ? (candle.low as number) : tp.price;
      markers.push({
        time: tp.time as Time,
        position: 'atPriceBottom',
        price: Math.max(low, Math.min(high, tp.price)),
        color: '#22c55e',
        shape: 'arrowUp',
        text: 'TP',
      });
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(markers);
  }, []);

  const updatePositionDrawing = useCallback((
    entry: SelectedPoint | null,
    slPrice: number | null,
    tpPrice: number | null,
    visible: boolean,
  ) => {
    const mgr = drawingManagerRef.current;
    if (!mgr) return;

    if (positionDrawingIdRef.current) {
      mgr.removeDrawing(positionDrawingIdRef.current);
      positionDrawingIdRef.current = null;
    }

    if (!entry || slPrice === null || tpPrice === null || !visible) return;

    const id = nextDrawingId();
    const entryAnchor: Anchor = { time: entry.time as Time, price: entry.price };
    const slAnchor: Anchor = { time: entry.time as Time, price: slPrice };
    const tpAnchor: Anchor = { time: entry.time as Time, price: tpPrice };
    const posOpts = { showPrices: true, showPercentage: true, showRiskReward: true };

    const drawing = direction === 'LONG'
      ? LongPosition.create(id, entryAnchor, slAnchor, tpAnchor, {}, posOpts)
      : ShortPosition.create(id, entryAnchor, slAnchor, tpAnchor, {}, posOpts);

    mgr.addDrawing(drawing);
    positionDrawingIdRef.current = id;
  }, [direction]);

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

    const mgr = new DrawingManager();
    mgr.attach(chart, candleSeries, containerRef.current);
    drawingManagerRef.current = mgr;

    chart.subscribeClick((param) => {
      if (!param.point) return;

      const cursorPrice = candleSeries.coordinateToPrice(param.point.y);
      if (cursorPrice === null) return;

      const price = cursorPrice as number;
      const currentStep = stepRef.current;
      const currentMode = slTpModeRef.current;

      if (currentStep === 'entry') {
        if (!param.time) return;
        const candle = candleDataRef.current.find((c) => c.time === param.time);
        if (!candle) return;
        const candleTime = candle.time as number;
        const point = { time: candleTime, price };
        setEntryPoint(point);
        entryPointRef.current = point;
        updateMarkers(point, null, null);
      } else if (currentStep === 'stop_loss' && currentMode === 'manual') {
        const entry = entryPointRef.current;
        if (!entry) return;
        const point = { time: entry.time, price };
        setStopLossPoint(point);
        setStep('take_profit');
        updateMarkers(entry, null, null);
      } else if (currentStep === 'take_profit' && currentMode === 'manual') {
        const entry = entryPointRef.current;
        if (!entry) return;
        const point = { time: entry.time, price };
        setTakeProfitPoint(point);
        setStep('done');
        updateMarkers(entry, null, null);
      }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && range.from < 0 && earliestLoadedDateRef.current && !isLoadingMoreRef.current) {
        void loadMore();
      }
    });

    return () => {
      mgr.detach();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
      drawingManagerRef.current = null;
      positionDrawingIdRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slTpMode !== 'manual') return;
    if (!entryPoint) return;

    let slPrice: number | null = null;
    let tpPrice: number | null = null;

    if (stopLossPoint) slPrice = stopLossPoint.price;
    if (takeProfitPoint) tpPrice = takeProfitPoint.price;

    if (slPrice !== null && tpPrice !== null) {
      updatePositionDrawing(entryPoint, slPrice, tpPrice, showPositionVis);
    }
  }, [entryPoint, stopLossPoint, takeProfitPoint, showPositionVis, slTpMode, updatePositionDrawing]);

  useEffect(() => {
    if (slTpMode !== 'auto') return;
    if (!entryPoint || autoSlPrice === null || autoTpPrice === null) return;
    updatePositionDrawing(entryPoint, autoSlPrice, autoTpPrice, showPositionVis);
  }, [entryPoint, autoSlPrice, autoTpPrice, showPositionVis, slTpMode, updatePositionDrawing]);

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
    setEntryPoint(null);
    setStopLossPoint(null);
    setTakeProfitPoint(null);
    setStep('entry');
    setSlTpMode('pending');
    markersRef.current?.setMarkers([]);
    earliestLoadedDateRef.current = from;

    if (positionDrawingIdRef.current && drawingManagerRef.current) {
      drawingManagerRef.current.removeDrawing(positionDrawingIdRef.current);
      positionDrawingIdRef.current = null;
    }

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
    if (!entryPoint) return;
    const date = timestampToDatetimeLocal(entryPoint.time);
    const price = formatPrice(entryPoint.price);

    if (slTpMode === 'skip' || slTpMode === 'pending') {
      onApply(date, price);
    } else if (slTpMode === 'manual') {
      const sl = stopLossPoint ? formatPrice(stopLossPoint.price) : undefined;
      const tp = takeProfitPoint ? formatPrice(takeProfitPoint.price) : undefined;
      onApply(date, price, sl, tp);
    } else if (slTpMode === 'auto') {
      const sl = autoSlPrice !== null ? formatPrice(autoSlPrice) : undefined;
      const tp = autoTpPrice !== null ? formatPrice(autoTpPrice) : undefined;
      onApply(date, price, sl, tp);
    }
  };

  const handleSelectMode = (mode: SlTpMode) => {
    setSlTpMode(mode);
    if (mode === 'manual') {
      setStep('stop_loss');
    } else if (mode === 'auto' || mode === 'skip') {
      setStep('done');
    }
  };

  const handleResetSlTp = () => {
    setSlTpMode('pending');
    setStep('entry');
    setStopLossPoint(null);
    setTakeProfitPoint(null);
    if (positionDrawingIdRef.current && drawingManagerRef.current) {
      drawingManagerRef.current.removeDrawing(positionDrawingIdRef.current);
      positionDrawingIdRef.current = null;
    }
    if (entryPoint) {
      updateMarkers(entryPoint, null, null);
    }
  };

  const handleResetAll = () => {
    setEntryPoint(null);
    entryPointRef.current = null;
    setStopLossPoint(null);
    stopLossPointRef.current = null;
    setTakeProfitPoint(null);
    setStep('entry');
    setSlTpMode('pending');
    markersRef.current?.setMarkers([]);
    if (positionDrawingIdRef.current && drawingManagerRef.current) {
      drawingManagerRef.current.removeDrawing(positionDrawingIdRef.current);
      positionDrawingIdRef.current = null;
    }
  };

  const stepInstruction = (): string => {
    if (step === 'entry') return 'Кликните в точку входа — цена берётся с перекрестия, время с открытия свечи';
    if (step === 'stop_loss') return 'Кликните на уровень стоп-лосса на графике';
    if (step === 'take_profit') return 'Кликните на уровень тейк-профита на графике';
    return 'Параметры сделки выбраны';
  };

  const canApply = entryPoint !== null && (
    slTpMode === 'skip' ||
    slTpMode === 'pending' ||
    (slTpMode === 'manual' && step === 'done') ||
    (slTpMode === 'auto' && autoSlPrice !== null && autoTpPrice !== null)
  );

  const hasSlTp = (slTpMode === 'manual' && stopLossPoint && takeProfitPoint) ||
    (slTpMode === 'auto' && autoSlPrice !== null && autoTpPrice !== null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Выбор параметров на графике — {ticker}</DialogTitle>
        <DialogDescription>{stepInstruction()}</DialogDescription>
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

      {/* Entry point info */}
      {entryPoint && (
        <div className="mt-3 p-3 rounded-lg border border-border bg-glass-soft">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Дата и время</div>
              <div className="text-sm font-medium">{formatDisplayDate(entryPoint.time)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Цена входа</div>
              <div className="text-sm font-medium text-blue">{formatPrice(entryPoint.price)}</div>
            </div>
            {slTpMode === 'manual' && stopLossPoint && (
              <div>
                <div className="text-xs text-muted-foreground">Стоп-лосс</div>
                <div className="text-sm font-medium text-red">{formatPrice(stopLossPoint.price)}</div>
              </div>
            )}
            {slTpMode === 'manual' && takeProfitPoint && (
              <div>
                <div className="text-xs text-muted-foreground">Тейк-профит</div>
                <div className="text-sm font-medium text-green">{formatPrice(takeProfitPoint.price)}</div>
              </div>
            )}
            {slTpMode === 'auto' && autoSlPrice !== null && (
              <div>
                <div className="text-xs text-muted-foreground">Стоп-лосс</div>
                <div className="text-sm font-medium text-red">{formatPrice(autoSlPrice)}</div>
              </div>
            )}
            {slTpMode === 'auto' && autoTpPrice !== null && (
              <div>
                <div className="text-xs text-muted-foreground">Тейк-профит</div>
                <div className="text-sm font-medium text-green">{formatPrice(autoTpPrice)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SL/TP mode selection */}
      {entryPoint && slTpMode === 'pending' && (
        <div className="mt-3 p-3 rounded-lg border border-blue/20 bg-blue/5">
          <div className="text-sm font-medium mb-2">Стоп-лосс и тейк-профит</div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => handleSelectMode('manual')}
              className="border-blue/30 text-blue hover:bg-blue/10 bg-transparent"
            >
              Указать на графике
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => handleSelectMode('auto')}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 bg-transparent"
            >
              Автоматически по %
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSelectMode('skip')}
            >
              Пропустить
            </Button>
          </div>
        </div>
      )}

      {/* Auto mode: percent inputs */}
      {slTpMode === 'auto' && entryPoint && (
        <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Стоп-лосс, %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={autoSlPercent}
                onChange={(e) => setAutoSlPercent(e.target.value)}
                className="w-24 h-8 text-sm"
              />
              {autoSlPrice !== null && (
                <div className="text-xs text-red">{formatPrice(autoSlPrice)}</div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Тейк-профит, %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={autoTpPercent}
                onChange={(e) => setAutoTpPercent(e.target.value)}
                className="w-24 h-8 text-sm"
              />
              {autoTpPrice !== null && (
                <div className="text-xs text-green">{formatPrice(autoTpPrice)}</div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetSlTp}
              className="text-xs text-muted-foreground"
            >
              Сбросить
            </Button>
          </div>
        </div>
      )}

      {/* Manual mode: step indicator */}
      {slTpMode === 'manual' && step !== 'done' && (
        <div className="mt-3 p-3 rounded-lg border border-blue/20 bg-blue/5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${step === 'stop_loss' ? 'bg-red animate-pulse' : 'bg-red/30'}`} />
              <span className={`text-xs ${step === 'stop_loss' ? 'text-red font-medium' : 'text-muted-foreground'}`}>Стоп-лосс</span>
            </div>
            <div className="text-muted-foreground text-xs">→</div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${step === 'take_profit' ? 'bg-green animate-pulse' : 'bg-green/30'}`} />
              <span className={`text-xs ${step === 'take_profit' ? 'text-green font-medium' : 'text-muted-foreground'}`}>Тейк-профит</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetSlTp}
              className="text-xs text-muted-foreground ml-auto"
            >
              Сбросить
            </Button>
          </div>
        </div>
      )}

      {/* Done in manual mode — show reset */}
      {slTpMode === 'manual' && step === 'done' && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetSlTp}
            className="text-xs text-muted-foreground"
          >
            Сбросить SL/TP
          </Button>
        </div>
      )}

      {/* Position visualization toggle */}
      {hasSlTp && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={togglePositionVis}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              showPositionVis
                ? 'bg-blue/20 text-blue border border-blue/30'
                : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground border border-border'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {showPositionVis ? (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
            {showPositionVis ? 'Позиция на графике' : 'Показать позицию'}
          </button>
        </div>
      )}

      <DialogFooter className="mt-4">
        {entryPoint && (
          <Button variant="ghost" size="sm" onClick={handleResetAll} className="mr-auto text-muted-foreground">
            Начать заново
          </Button>
        )}
        <Button variant="primary" disabled={!canApply} onClick={handleApply}>
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
  direction,
}: ChartPricePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {open && (
          <ChartPickerContent
            ticker={ticker}
            onApply={(date, price, sl, tp) => {
              onApply(date, price, sl, tp);
              onOpenChange(false);
            }}
            minDate={minDate}
            direction={direction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
