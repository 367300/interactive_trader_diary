"""Резолвер пропусков в локальном хранилище свечей."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import pandas as pd
from django.conf import settings
from django.core.cache import cache

from instruments.candles import candle_path, _candles_root

logger = logging.getLogger(__name__)

_LAST_SAVED_TTL = 60  # секунд


@dataclass(frozen=True)
class GapRange:
    from_date: date
    till_date: date  # включительно
    reason: Literal["missing_days", "tail"]


def _last_saved_cache_key(ticker: str) -> str:
    return f"candles:last_saved:{ticker.upper()}"


def _last_saved_cache_clear() -> None:
    """Тестовый helper — сброс кеша last_saved для всех тикеров."""
    try:
        cache.delete_pattern("candles:last_saved:*")
    except Exception:
        pass


def _ticker_root(ticker: str) -> Path:
    return _candles_root() / ticker.upper()


def _iter_day_files_desc(ticker: str) -> list[Path]:
    """Все CSV дневных файлов тикера, отсортированные по дате убывания."""
    root = _ticker_root(ticker)
    if not root.exists():
        return []
    files: list[tuple[date, Path]] = []
    for year_dir in root.iterdir():
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        year = int(year_dir.name)
        for month_dir in year_dir.iterdir():
            if not month_dir.is_dir() or not month_dir.name.isdigit():
                continue
            month = int(month_dir.name)
            for day_file in month_dir.glob("*.csv"):
                try:
                    day = int(day_file.stem)
                    files.append((date(year, month, day), day_file))
                except ValueError:
                    continue
    files.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in files]


def last_saved_candle_dt(ticker: str) -> datetime | None:
    """Найти последний сохранённый timestamp в CSV-файлах тикера."""
    ticker = ticker.upper()
    cached = cache.get(_last_saved_cache_key(ticker))
    if cached is not None:
        return datetime.fromisoformat(cached) if isinstance(cached, str) else cached

    files = _iter_day_files_desc(ticker)
    for path in files:
        try:
            df = pd.read_csv(path, usecols=["datetime"], parse_dates=["datetime"])
            if df.empty:
                continue
            last = df["datetime"].max().to_pydatetime()
            cache.set(_last_saved_cache_key(ticker), last.isoformat(), _LAST_SAVED_TTL)
            return last
        except Exception as exc:
            logger.warning("last_saved_candle_dt: failed to read %s: %s", path, exc)
            continue
    return None


def _iter_trading_days(start: date, end: date):
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # Mon-Fri
            yield cur
        cur += timedelta(days=1)


def _next_trading_day(d: date) -> date:
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5:
        nxt += timedelta(days=1)
    return nxt


def _group_consecutive_days(days: list[date]) -> list[tuple[date, date]]:
    if not days:
        return []
    days = sorted(days)
    ranges: list[tuple[date, date]] = []
    run_start = days[0]
    prev = days[0]
    for d in days[1:]:
        next_trading = _next_trading_day(prev)
        if d == next_trading:
            prev = d
            continue
        ranges.append((run_start, prev))
        run_start = d
        prev = d
    ranges.append((run_start, prev))
    return ranges


def _has_data_for_day(ticker: str, day: date) -> bool:
    path = candle_path(ticker, day)
    try:
        return path.exists() and path.stat().st_size > 0
    except OSError:
        return False


def find_missing_ranges(
    ticker: str,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[GapRange]:
    """Список пропущенных диапазонов в локальном хранилище свечей."""
    ticker = ticker.upper()
    today = date.today()
    start = start or date(settings.CANDLES_HISTORY_START_YEAR, 1, 1)
    end = end or today
    if start > end:
        return []

    trading = list(_iter_trading_days(start, end))
    missing_days = [d for d in trading if not _has_data_for_day(ticker, d)]
    grouped = _group_consecutive_days(missing_days)
    ranges = [GapRange(a, b, "missing_days") for a, b in grouped]

    last_dt = last_saved_candle_dt(ticker)
    if last_dt is not None:
        last_day = last_dt.date()
        tail_end = min(end, today) if end > today else end
        # last_day == tail_end == today: торговый день ещё идёт, добиваем
        # текущий день с последней свечи до now (fetch_tinkoff_candles за
        # один день не дороже одного запроса, дубликаты дропнутся в merge).
        need_tail = last_day < tail_end or (last_day == tail_end == today)
        if need_tail:
            tail = GapRange(last_day, tail_end, "tail")
            ranges = [r for r in ranges if not (r.from_date <= tail.till_date and r.till_date >= tail.from_date)]
            ranges.append(tail)

    ranges.sort(key=lambda r: r.from_date)
    return ranges
