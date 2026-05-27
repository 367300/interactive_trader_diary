const MOSCOW_TZ = 'Europe/Moscow';
const MOSCOW_OFFSET = '+03:00';

function toMoscowLocal(date: Date): string {
  return date
    .toLocaleString('sv-SE', { timeZone: MOSCOW_TZ })
    .slice(0, 16)
    .replace(' ', 'T');
}

export function nowForInput(): string {
  return toMoscowLocal(new Date());
}

export function isoToInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return toMoscowLocal(d);
}

export function inputToIso(value: string): string {
  return new Date(value + MOSCOW_OFFSET).toISOString();
}
