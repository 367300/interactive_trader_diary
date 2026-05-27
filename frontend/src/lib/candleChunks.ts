const CHUNK_DAYS: [number, number][] = [
  [1, 2],
  [5, 5],
  [15, 14],
  [30, 21],
  [60, 30],
  [240, 90],
  [Infinity, 365],
];

export function getChunkDays(interval: number): number {
  for (const [maxInterval, days] of CHUNK_DAYS) {
    if (interval <= maxInterval) return days;
  }
  return 365;
}

export function getInitialDateRange(interval: number): { from: string; till: string } {
  const till = new Date();
  const from = new Date();
  from.setDate(from.getDate() - getChunkDays(interval));
  return {
    from: from.toISOString().slice(0, 10),
    till: till.toISOString().slice(0, 10),
  };
}

export function getEarlierDateRange(
  earliestDate: string,
  interval: number,
): { from: string; till: string } {
  const till = new Date(earliestDate);
  till.setDate(till.getDate() - 1);
  const from = new Date(till);
  from.setDate(from.getDate() - getChunkDays(interval));
  return {
    from: from.toISOString().slice(0, 10),
    till: till.toISOString().slice(0, 10),
  };
}
