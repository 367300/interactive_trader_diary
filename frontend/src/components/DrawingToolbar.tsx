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

interface Props {
  activeTool: string | null;
  onSelectTool: (type: string | null) => void;
  onClearAll: () => void;
  onDeleteSelected: () => void;
  onResetAll: () => void;
  hasSelection: boolean;
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

export default function DrawingToolbar({
  activeTool,
  onSelectTool,
  onClearAll,
  onDeleteSelected,
  onResetAll,
  hasSelection,
}: Props) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const activeToolLabel = activeTool
    ? TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.type === activeTool)?.label
    : null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
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
