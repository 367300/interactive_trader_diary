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
