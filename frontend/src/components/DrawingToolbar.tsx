import { useState, useRef, useEffect } from 'react';

interface ToolGroup {
  label: string;
  tools: { type: string; label: string }[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Линии',
    tools: [
      { type: 'trend-line', label: 'Трендовая линия' },
      { type: 'ray', label: 'Луч' },
      { type: 'extended-line', label: 'Продлённая линия' },
      { type: 'horizontal-line', label: 'Горизонтальная линия' },
      { type: 'vertical-line', label: 'Вертикальная линия' },
      { type: 'cross-line', label: 'Перекрестие' },
      { type: 'info-line', label: 'Инфо-линия' },
    ],
  },
  {
    label: 'Фибоначчи',
    tools: [
      { type: 'fib-retracement', label: 'Коррекция Фибоначчи' },
      { type: 'fib-extension', label: 'Расширение Фибоначчи' },
      { type: 'fib-channel', label: 'Канал Фибоначчи' },
      { type: 'fib-time-zone', label: 'Временные зоны Фибоначчи' },
      { type: 'fib-arcs', label: 'Дуги Фибоначчи' },
      { type: 'fib-speed-fan', label: 'Веер скорости Фибоначчи' },
    ],
  },
  {
    label: 'Каналы',
    tools: [
      { type: 'parallel-channel', label: 'Параллельный канал' },
      { type: 'regression-trend', label: 'Регрессионный тренд' },
      { type: 'flat-top-bottom', label: 'Флэт' },
      { type: 'disjoint-channel', label: 'Разъединённый канал' },
    ],
  },
  {
    label: 'Вилы',
    tools: [
      { type: 'andrews-pitchfork', label: 'Вилы Эндрюса' },
      { type: 'schiff-pitchfork', label: 'Вилы Шиффа' },
      { type: 'modified-schiff-pitchfork', label: 'Модиф. вилы Шиффа' },
    ],
  },
  {
    label: 'Ганн',
    tools: [
      { type: 'gann-box', label: 'Коробка Ганна' },
      { type: 'gann-fan', label: 'Веер Ганна' },
      { type: 'gann-square-fixed', label: 'Квадрат Ганна (фикс.)' },
      { type: 'gann-square', label: 'Квадрат Ганна' },
    ],
  },
  {
    label: 'Фигуры',
    tools: [
      { type: 'rectangle', label: 'Прямоугольник' },
      { type: 'circle', label: 'Круг' },
      { type: 'ellipse', label: 'Эллипс' },
      { type: 'triangle', label: 'Треугольник' },
      { type: 'arc', label: 'Дуга' },
      { type: 'path', label: 'Путь' },
      { type: 'polyline', label: 'Полилиния' },
      { type: 'brush', label: 'Кисть' },
    ],
  },
  {
    label: 'Позиции',
    tools: [
      { type: 'long-position', label: 'Длинная позиция' },
      { type: 'short-position', label: 'Короткая позиция' },
      { type: 'price-range', label: 'Ценовой диапазон' },
      { type: 'date-range', label: 'Временной диапазон' },
      { type: 'date-price-range', label: 'Диапазон цена/время' },
    ],
  },
  {
    label: 'Заметки',
    tools: [
      { type: 'text-annotation', label: 'Текст' },
      { type: 'callout', label: 'Выноска' },
      { type: 'arrow', label: 'Стрелка' },
      { type: 'arrow-mark-up', label: 'Стрелка вверх' },
      { type: 'arrow-mark-down', label: 'Стрелка вниз' },
      { type: 'flag-mark', label: 'Флаг' },
    ],
  },
];

const COLOR_PRESETS = [
  '#5a8cff', '#22c55e', '#ef4444', '#f59e0b',
  '#a855f7', '#06b6d4', '#ec4899', '#ffffff',
];

const LINE_DASH_PRESETS: { label: string; value: number[] | undefined; preview: string }[] = [
  { label: 'Сплошная', value: undefined, preview: '───' },
  { label: 'Пунктир', value: [6, 3], preview: '- - -' },
  { label: 'Точка-пунктир', value: [6, 3, 1, 3], preview: '- · -' },
];

function MagnetIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M1 6V9C1 12.866 4.13401 16 8 16C11.866 16 15 12.866 15 9V6H10V9C10 10.1046 9.10457 11 8 11C6.89543 11 6 10.1046 6 9V6H1Z" fill="currentColor"/>
      <path d="M1 4H6V1H1V4Z" fill="currentColor"/>
      <path d="M10 4H15V1H10V4Z" fill="currentColor"/>
    </svg>
  );
}

interface Props {
  activeTool: string | null;
  onSelectTool: (type: string | null) => void;
  onClearAll: () => void;
  onDeleteSelected: () => void;
  onResetAll: () => void;
  onChangeColor: (color: string) => void;
  onChangeLineDash: (dash: number[] | undefined) => void;
  hasSelection: boolean;
  magnetMode: boolean;
  onToggleMagnet: () => void;
  activeColor: string;
  activeLineDash: number[] | undefined;
}

function DropdownMenu({
  group,
  activeTool,
  onSelect,
  closeMenu,
}: {
  group: ToolGroup;
  activeTool: string | null;
  onSelect: (type: string) => void;
  closeMenu: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeMenu]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-lg border border-border bg-bg-b/95 backdrop-blur-md shadow-md py-1"
    >
      {group.tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => {
            onSelect(tool.type);
            closeMenu();
          }}
          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
            activeTool === tool.type
              ? 'bg-blue/20 text-blue'
              : 'text-foreground hover:bg-glass-soft'
          }`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}

function dashKey(dash: number[] | undefined): string {
  return dash ? dash.join(',') : 'solid';
}

export default function DrawingToolbar({
  activeTool,
  onSelectTool,
  onClearAll,
  onDeleteSelected,
  onResetAll,
  onChangeColor,
  onChangeLineDash,
  hasSelection,
  magnetMode,
  onToggleMagnet,
  activeColor,
  activeLineDash,
}: Props) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const activeToolLabel = activeTool
    ? TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.type === activeTool)?.label
    : null;

  const showStyleControls = activeTool || hasSelection;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Magnet toggle */}
      <button
        onClick={onToggleMagnet}
        className={`p-1.5 rounded transition-colors ${
          magnetMode
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground'
        }`}
        title={magnetMode ? 'Магнит вкл. — привязка к OHLC' : 'Магнит выкл.'}
      >
        <MagnetIcon />
      </button>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Tool groups */}
      {TOOL_GROUPS.map((group) => {
        const hasActive = group.tools.some((t) => t.type === activeTool);
        return (
          <div key={group.label} className="relative">
            <button
              onClick={() =>
                setOpenGroup(openGroup === group.label ? null : group.label)
              }
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                hasActive
                  ? 'bg-blue/20 text-blue border border-blue/30'
                  : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground'
              }`}
            >
              {group.label}
              <span className="ml-1 text-[10px] opacity-60">▼</span>
            </button>
            {openGroup === group.label && (
              <DropdownMenu
                group={group}
                activeTool={activeTool}
                onSelect={onSelectTool}
                closeMenu={() => setOpenGroup(null)}
              />
            )}
          </div>
        );
      })}

      {activeTool && (
        <button
          onClick={() => onSelectTool(null)}
          className="px-2 py-1 rounded text-xs font-medium bg-red/20 text-red border border-red/30 hover:bg-red/30 transition-colors ml-1"
          title="Отменить инструмент"
        >
          ✕
        </button>
      )}

      {/* Color + line style — shown when tool active OR drawing selected */}
      {showStyleControls && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex items-center gap-0.5">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => onChangeColor(color)}
                className={`w-4 h-4 rounded-full border hover:scale-125 transition-transform cursor-pointer ${
                  activeColor === color ? 'border-white ring-1 ring-white/40' : 'border-white/20'
                }`}
                style={{ backgroundColor: color }}
                title={`Цвет: ${color}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-0.5 ml-1">
            {LINE_DASH_PRESETS.map((preset) => (
              <button
                key={preset.preview}
                onClick={() => onChangeLineDash(preset.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  dashKey(activeLineDash) === dashKey(preset.value)
                    ? 'bg-blue/20 text-blue border border-blue/30'
                    : 'text-muted-foreground hover:bg-glass-soft hover:text-foreground'
                }`}
                title={preset.label}
              >
                {preset.preview}
              </button>
            ))}
          </div>
        </>
      )}

      {hasSelection && (
        <button
          onClick={onDeleteSelected}
          className="px-2 py-1 rounded text-xs font-medium text-red hover:bg-red/20 transition-colors"
          title="Удалить выделенный"
        >
          Удалить
        </button>
      )}

      <button
        onClick={onClearAll}
        className="px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-glass-soft hover:text-foreground transition-colors ml-auto"
        title="Очистить все объекты"
      >
        Очистить всё
      </button>

      <button
        onClick={onResetAll}
        className="px-2 py-1 rounded text-xs font-medium text-red/80 hover:bg-red/20 hover:text-red transition-colors"
        title="Сбросить все настройки графика, рисунки и позицию"
      >
        Сбросить всё
      </button>

      {activeToolLabel && (
        <span className="text-xs text-blue/80 ml-2">
          {activeToolLabel}
        </span>
      )}
    </div>
  );
}
