export function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  });
}

export function formatPips(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 1)}`;
}

export function pnlClass(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-soft-foreground';
  if (value > 0) return 'text-green';
  if (value < 0) return 'text-red';
  return 'text-soft-foreground';
}

export function directionLabel(direction: string) {
  return direction === 'LONG' ? 'Лонг' : direction === 'SHORT' ? 'Шорт' : direction;
}
