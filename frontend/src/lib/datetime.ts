const MSK_OFFSET_MS = 3 * 3600 * 1000;
const MSK_OFFSET_STR = '+03:00';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toMoscowLocal(date: Date): string {
  const msk = new Date(date.getTime() + MSK_OFFSET_MS);
  return `${msk.getUTCFullYear()}-${pad(msk.getUTCMonth() + 1)}-${pad(msk.getUTCDate())}T${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())}`;
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
  return new Date(value + MSK_OFFSET_STR).toISOString();
}
