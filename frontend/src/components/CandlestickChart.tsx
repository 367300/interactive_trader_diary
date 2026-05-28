import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import {
  DrawingManager,
  ToolRegistry,
  type SerializedDrawing,
  type IDrawing,
  type Anchor,
} from 'lightweight-charts-drawing';
import { instrumentsApi } from '../api/endpoints';
import type { CandleData } from '../api/types';
import { getInitialDateRange, getEarlierDateRange } from '@/lib/candleChunks';
import { Alert } from '@/components/ui/alert';
import DrawingToolbar from './DrawingToolbar';
import {
  loadChartSettings,
  saveChartSettings,
  saveDrawings,
  loadDrawings,
  clearChartSettings,
} from '@/lib/chartStorage';

const INTERVALS = [
  { value: 1, label: '1м' },
  { value: 5, label: '5м' },
  { value: 15, label: '15м' },
  { value: 30, label: '30м' },
  { value: 60, label: '1ч' },
  { value: 240, label: '4ч' },
  { value: 1440, label: '1д' },
] as const;

function parseCustomInterval(input: string): number | null {
  const s = input.trim().toLowerCase();
  const match = s.match(/^(\d+)\s*([mмhчdд]?)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2];
  if (unit === 'h' || unit === 'ч') return num * 60;
  if (unit === 'd' || unit === 'д') return num * 1440;
  return num;
}

function formatInterval(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}д`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}ч`;
  return `${minutes}м`;
}

function binarySearchNearest(timestamps: number[], target: number): number {
  if (timestamps.length === 0) return -1;
  if (target <= timestamps[0]) return 0;
  if (target >= timestamps[timestamps.length - 1]) return timestamps.length - 1;
  let lo = 0, hi = timestamps.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] <= target) lo = mid;
    else hi = mid;
  }
  return (target - timestamps[lo] <= timestamps[hi] - target) ? lo : hi;
}

function nearestOHLC(candle: CandlestickData<Time>, price: number): number {
  const values = [
    candle.open as number,
    candle.high as number,
    candle.low as number,
    candle.close as number,
  ];
  let nearest = values[0];
  let minDist = Math.abs(price - nearest);
  for (let i = 1; i < values.length; i++) {
    const dist = Math.abs(price - values[i]);
    if (dist < minDist) {
      minDist = dist;
      nearest = values[i];
    }
  }
  return nearest;
}

let drawingIdCounter = Date.now();
function nextDrawingId(): string {
  return `d-${++drawingIdCounter}`;
}

export type ChartMarker = {
  time: number; // unix seconds
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text?: string;
  size?: number;
};

export interface CandlestickChartProps {
  ticker: string;
  markers?: ChartMarker[];
  onPointPick?: (point: { time: number; price: number }) => void;
  pickerMode?: boolean; // если true — клики идут в onPointPick, не в DrawingManager
}

export default function CandlestickChart({
  ticker,
  markers,
  onPointPick,
  pickerMode = false,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const pickerModeRef = useRef(pickerMode);
  const onPointPickRef = useRef(onPointPick);
  const drawingsRestoredRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeToolRef = useRef<string | null>(null);
  const previewDrawingIdRef = useRef<string | null>(null);
  const previewAnchorIdxRef = useRef<number>(0);
  const candleDataRef = useRef<CandlestickData<Time>[]>([]);
  const dataTimestampsRef = useRef<number[]>([]);
  const magnetModeRef = useRef(false);
  const activeColorRef = useRef('#5a8cff');
  const activeLineDashRef = useRef<number[] | undefined>(undefined);
  const isLoadingMoreRef = useRef(false);
  const earliestLoadedDateRef = useRef<string | null>(null);
  const volumeDataRef = useRef<HistogramData<Time>[]>([]);

  const saved = loadChartSettings(ticker);
  const [interval, setInterval] = useState(saved.interval ?? 5);

  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const loadEarlierRef = useRef<() => void>(() => {});
  const [customInput, setCustomInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [magnetMode, setMagnetMode] = useState(false);
  const [activeColor, setActiveColor] = useState('#5a8cff');
  const [activeLineDash, setActiveLineDash] = useState<number[] | undefined>(undefined);

  const persistDrawings = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const mgr = drawingManagerRef.current;
      if (!mgr) return;
      const data = mgr.exportDrawings();
      saveDrawings(ticker, data);
    }, 500);
  }, [ticker]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // Sync picker mode refs to avoid stale closure inside subscribeClick
  useEffect(() => { pickerModeRef.current = pickerMode; }, [pickerMode]);
  useEffect(() => { onPointPickRef.current = onPointPick; }, [onPointPick]);

  // Sync markers prop with chart
  useEffect(() => {
    if (!markersApiRef.current) return;
    markersApiRef.current.setMarkers((markers ?? []) as SeriesMarker<Time>[]);
  }, [markers]);

  async function loadEarlierCandles() {
    if (isLoadingMoreRef.current || !earliestLoadedDateRef.current) return;
    isLoadingMoreRef.current = true;

    try {
      const curInterval = intervalRef.current;
      const { from, till } = getEarlierDateRange(earliestLoadedDateRef.current, curInterval);
      const res = await instrumentsApi.candles(ticker, { from, till, interval: curInterval });
      if (!res.candles.length) {
        earliestLoadedDateRef.current = null;
        return;
      }

      const existingTimes = new Set(candleDataRef.current.map((c) => c.time as number));
      const newCandles: CandlestickData<Time>[] = [];
      const newVolume: HistogramData<Time>[] = [];

      for (const c of res.candles) {
        if (existingTimes.has(c.time)) continue;
        newCandles.push({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close });
        newVolume.push({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        });
      }

      if (!newCandles.length) {
        earliestLoadedDateRef.current = null;
        return;
      }

      const chart = chartRef.current;
      const visibleRange = chart?.timeScale().getVisibleRange();

      const combined = [...newCandles, ...candleDataRef.current];
      const combinedVolume = [...newVolume, ...volumeDataRef.current];

      candleDataRef.current = combined;
      volumeDataRef.current = combinedVolume;
      dataTimestampsRef.current = combined.map((c) => c.time as number);

      candleSeriesRef.current?.setData(combined);
      volumeSeriesRef.current?.setData(combinedVolume);

      if (visibleRange) {
        try { chart?.timeScale().setVisibleRange(visibleRange); } catch { /* range outside data */ }
      }

      earliestLoadedDateRef.current = from;
    } finally {
      isLoadingMoreRef.current = false;
    }
  }
  loadEarlierRef.current = loadEarlierCandles;

  // Chart creation (once)
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
    markersApiRef.current = createSeriesMarkers<Time>(candleSeries);
    // Apply initial markers if they were provided before chart init completed
    if (markers && markers.length > 0) {
      markersApiRef.current.setMarkers(markers as SeriesMarker<Time>[]);
    }

    // Patch timeToCoordinate for cross-timeframe drawing support
    const ts = chart.timeScale();
    const origTimeToCoord = ts.timeToCoordinate.bind(ts);
    try {
      (ts as any).timeToCoordinate = (time: Time) => {
        const coord = origTimeToCoord(time);
        if (coord !== null) return coord;
        const timestamps = dataTimestampsRef.current;
        const t = time as number;
        if (timestamps.length < 2) return null;
        if (t < timestamps[0] || t > timestamps[timestamps.length - 1]) return null;
        let lo = 0, hi = timestamps.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (timestamps[mid] <= t) lo = mid;
          else hi = mid;
        }
        const t0 = timestamps[lo], t1 = timestamps[hi];
        const frac = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
        return ts.logicalToCoordinate((lo + frac) as any);
      };
    } catch { /* frozen object — skip patch */ }

    const mgr = new DrawingManager();
    mgr.attach(chart, candleSeries, containerRef.current);

    mgr.on('drawing:added', () => persistDrawings());
    mgr.on('drawing:removed', () => persistDrawings());
    mgr.on('drawing:updated', () => persistDrawings());
    mgr.on('drawing:cleared', () => persistDrawings());
    mgr.on('drawing:selected', () => setHasSelection(true));
    mgr.on('drawing:deselected', () => setHasSelection(false));

    drawingManagerRef.current = mgr;
    drawingsRestoredRef.current = false;

    const registry = ToolRegistry.getInstance();

    // Click handler — creates drawings with preview for multi-anchor tools
    chart.subscribeClick((param) => {
      // Picker mode short-circuit: forward click coordinates to onPointPick instead of drawing
      if (pickerModeRef.current && onPointPickRef.current) {
        if (!param.time || !param.point) return;
        const candlePrice = candleSeries.coordinateToPrice(param.point.y);
        if (candlePrice === null) return;
        const t = param.time;
        const unixTime =
          typeof t === 'number'
            ? t
            : Math.floor(new Date(t as unknown as string).getTime() / 1000);
        onPointPickRef.current({
          time: unixTime,
          price: Number(candlePrice),
        });
        return;
      }

      const toolType = activeToolRef.current;
      if (!toolType || !param.time || !param.point) return;

      let price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return;

      let anchor: Anchor = { time: param.time, price: price as number };

      // Magnet snap to OHLC
      if (magnetModeRef.current) {
        const idx = binarySearchNearest(dataTimestampsRef.current, param.time as number);
        if (idx >= 0 && idx < candleDataRef.current.length) {
          const candle = candleDataRef.current[idx];
          anchor = { time: candle.time, price: nearestOHLC(candle, price as number) };
        }
      }

      const previewId = previewDrawingIdRef.current;

      if (!previewId) {
        // First click — create drawing
        const def = registry.get(toolType);
        const required = def?.requiredAnchors ?? 2;

        if (required === 1) {
          const drawing = registry.createDrawing(
            toolType, nextDrawingId(), [anchor],
            { lineColor: activeColorRef.current, lineWidth: 2, lineDash: activeLineDashRef.current, fillColor: 'rgba(90,140,255,0.15)', fillOpacity: 0.15 },
          );
          if (drawing) mgr.addDrawing(drawing);
          activeToolRef.current = null;
          setActiveTool(null);
          mgr.setActiveTool(null);
        } else {
          // Multi-anchor: create with all anchors at first click, preview the rest
          const anchors = Array.from({ length: required }, () => ({ ...anchor }));
          const id = nextDrawingId();
          const drawing = registry.createDrawing(
            toolType, id, anchors,
            { lineColor: activeColorRef.current, lineWidth: 2, lineDash: activeLineDashRef.current, fillColor: 'rgba(90,140,255,0.15)', fillOpacity: 0.15 },
          );
          if (drawing) {
            mgr.addDrawing(drawing);
            previewDrawingIdRef.current = id;
            previewAnchorIdxRef.current = 1;
          }
        }
      } else {
        // Subsequent click — fix anchor
        const drawing = mgr.getDrawing(previewId);
        if (drawing) {
          drawing.updateAnchor(previewAnchorIdxRef.current, anchor);

          const def = registry.get(toolType);
          const required = def?.requiredAnchors ?? 2;

          if (previewAnchorIdxRef.current >= required - 1) {
            // All anchors placed — finalize + auto-deactivate
            previewDrawingIdRef.current = null;
            previewAnchorIdxRef.current = 0;
            activeToolRef.current = null;
            setActiveTool(null);
            mgr.setActiveTool(null);
          } else {
            previewAnchorIdxRef.current++;
          }
        }
      }
    });

    // Mouse handlers on container
    const container = containerRef.current;

    // Preview tracking + magnet crosshair
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);
      if (time === null || price === null) return;

      // Preview drawing — update tracked anchor
      const previewId = previewDrawingIdRef.current;
      if (previewId) {
        let anchor: Anchor = { time, price: price as number };
        if (magnetModeRef.current) {
          const idx = binarySearchNearest(dataTimestampsRef.current, time as number);
          if (idx >= 0 && idx < candleDataRef.current.length) {
            const candle = candleDataRef.current[idx];
            anchor = { time: candle.time, price: nearestOHLC(candle, price as number) };
          }
        }
        const drawing = mgr.getDrawing(previewId);
        if (drawing) {
          drawing.updateAnchor(previewAnchorIdxRef.current, anchor);
        }
      }

      // Magnet crosshair — snap to nearest OHLC
      if (magnetModeRef.current) {
        const idx = binarySearchNearest(dataTimestampsRef.current, time as number);
        if (idx >= 0 && idx < candleDataRef.current.length) {
          const candle = candleDataRef.current[idx];
          const snappedPrice = nearestOHLC(candle, price as number);
          chart.setCrosshairPosition(snappedPrice, candle.time, candleSeries);
        }
      }
    };

    const onMouseLeave = () => {
      if (magnetModeRef.current) {
        chart.clearCrosshairPosition();
      }
    };

    // Disable chart scroll/scale during anchor drag
    const onMouseDown = (e: MouseEvent) => {
      if (!mgr.getSelectedDrawing()) return;
      const rect = container.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const anchorIdx = mgr.hitTestAnchor(point);
      if (anchorIdx !== null) {
        chart.applyOptions({ handleScroll: false, handleScale: false });
      }
    };
    const onMouseUp = () => {
      chart.applyOptions({ handleScroll: true, handleScale: true });
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);

    // Save visible range (debounced) + scroll-to-load
    let rangeTimer: ReturnType<typeof setTimeout> | null = null;
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (rangeTimer) clearTimeout(rangeTimer);
      rangeTimer = setTimeout(() => {
        if (range) {
          saveChartSettings(ticker, {
            visibleRange: { from: range.from as number, to: range.to as number },
          });
        }
      }, 500);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && range.from < 0 && earliestLoadedDateRef.current && !isLoadingMoreRef.current) {
        loadEarlierRef.current();
      }
    });

    return () => {
      if (rangeTimer) clearTimeout(rangeTimer);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mouseup', onMouseUp);
      mgr.detach();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersApiRef.current = null;
      drawingManagerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore drawings (once per ticker)
  useEffect(() => {
    if (!drawingsRestoredRef.current && drawingManagerRef.current) {
      const savedDrawings = loadDrawings(ticker);
      if (savedDrawings.length > 0) {
        const registry = ToolRegistry.getInstance();
        drawingManagerRef.current.importDrawings(
          savedDrawings,
          (type: string, data: SerializedDrawing): IDrawing | null => {
            return registry.createDrawing(type, data.id, data.anchors, data.style, data.options);
          },
        );
      }
      drawingsRestoredRef.current = true;
    }
  }, [ticker]);

  // Persist interval
  useEffect(() => {
    saveChartSettings(ticker, { interval });
  }, [ticker, interval]);

  // Load candle data
  useEffect(() => {
    let cancelled = false;
    const { from, till } = getInitialDateRange(interval);

    setLoading(true);
    setError(null);
    setNoData(false);
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
        dataTimestampsRef.current = candleData.map((c) => c.time as number);

        candleSeriesRef.current?.setData(candleData);
        volumeSeriesRef.current?.setData(volumeData);

        if (isInitialLoadRef.current) {
          const s = loadChartSettings(ticker);
          if (s.visibleRange) {
            try {
              chartRef.current?.timeScale().setVisibleRange({
                from: s.visibleRange.from as Time,
                to: s.visibleRange.to as Time,
              });
            } catch {
              chartRef.current?.timeScale().fitContent();
            }
          } else {
            chartRef.current?.timeScale().fitContent();
          }
          isInitialLoadRef.current = false;
        } else {
          chartRef.current?.timeScale().fitContent();
        }

        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker, interval]);

  const handleSelectTool = (type: string | null) => {
    // Cancel preview if deactivating
    if (!type && previewDrawingIdRef.current) {
      drawingManagerRef.current?.removeDrawing(previewDrawingIdRef.current);
      previewDrawingIdRef.current = null;
      previewAnchorIdxRef.current = 0;
    }

    setActiveTool(type);
    activeToolRef.current = type;

    if (type) {
      drawingManagerRef.current?.deselectAll();
      setHasSelection(false);
      // Ray defaults to dashed
      if (type === 'ray') {
        const dash = [6, 3];
        activeLineDashRef.current = dash;
        setActiveLineDash(dash);
      }
    }

    drawingManagerRef.current?.setActiveTool(type);
  };

  const handleClearAll = () => {
    drawingManagerRef.current?.clearAll();
    setHasSelection(false);
    previewDrawingIdRef.current = null;
    previewAnchorIdxRef.current = 0;
    saveDrawings(ticker, []);
  };

  const handleDeleteSelected = () => {
    const mgr = drawingManagerRef.current;
    if (!mgr) return;
    const selected = mgr.getSelectedDrawing();
    if (selected) {
      mgr.removeDrawing(selected.id);
      setHasSelection(false);
    }
  };

  const handleResetAll = () => {
    clearChartSettings(ticker);
    drawingManagerRef.current?.clearAll();
    setHasSelection(false);
    setActiveTool(null);
    activeToolRef.current = null;
    previewDrawingIdRef.current = null;
    previewAnchorIdxRef.current = 0;
    setInterval(5);
    isInitialLoadRef.current = false;
    chartRef.current?.timeScale().fitContent();
  };

  const handleCustomInterval = () => {
    const val = parseCustomInterval(customInput);
    if (val && val >= 1 && val <= 10080) {
      setInterval(val);
      setCustomInput('');
    }
  };

  const handleChangeColor = useCallback((color: string) => {
    activeColorRef.current = color;
    setActiveColor(color);
    const mgr = drawingManagerRef.current;
    if (!mgr) return;
    const selected = mgr.getSelectedDrawing();
    if (selected) {
      selected.updateStyle({ lineColor: color });
      persistDrawings();
    }
  }, [persistDrawings]);

  const handleChangeLineDash = useCallback((dash: number[] | undefined) => {
    activeLineDashRef.current = dash;
    setActiveLineDash(dash);
    const mgr = drawingManagerRef.current;
    if (!mgr) return;
    const selected = mgr.getSelectedDrawing();
    if (selected) {
      selected.updateStyle({ lineDash: dash });
      persistDrawings();
    }
  }, [persistDrawings]);

  const toggleMagnet = useCallback(() => {
    const newMode = !magnetModeRef.current;
    magnetModeRef.current = newMode;
    setMagnetMode(newMode);
    if (!newMode) {
      chartRef.current?.clearCrosshairPosition();
    }
  }, []);

  const isCustomInterval = !INTERVALS.some((iv) => iv.value === interval);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
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

        <div className="flex items-center gap-1 ml-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomInterval()}
            placeholder="2h, 45m…"
            className="w-20 px-2 py-1 rounded text-xs bg-glass-soft border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue/50"
          />
          {customInput && (
            <button
              onClick={handleCustomInterval}
              className="px-2 py-1 rounded text-xs font-medium text-blue hover:bg-blue/20 transition-colors"
            >
              ОК
            </button>
          )}
        </div>

        {isCustomInterval && (
          <span className="px-2 py-1 rounded text-xs font-medium bg-blue/20 text-blue border border-blue/30">
            {formatInterval(interval)}
          </span>
        )}
      </div>

      {!pickerMode && (
        <div className="mb-2">
          <DrawingToolbar
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
            onClearAll={handleClearAll}
            onDeleteSelected={handleDeleteSelected}
            onResetAll={handleResetAll}
            onChangeColor={handleChangeColor}
            onChangeLineDash={handleChangeLineDash}
            hasSelection={hasSelection}
            magnetMode={magnetMode}
            onToggleMagnet={toggleMagnet}
            activeColor={activeColor}
            activeLineDash={activeLineDash}
          />
        </div>
      )}

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
