"""
Утилиты для хранения и обработки свечей (source-agnostic).

Функции:
- save_candles_to_csv — сохранение свечей в CSV (по дням)
- read_candles        — чтение свечей из CSV за диапазон дат
- resample_candles    — пересэмплирование до 5m/15m/30m/1h/4h/1D
- candles_to_json     — конвертация DataFrame → JSON для lightweight-charts
"""

from __future__ import annotations

import logging
from datetime import date, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Константы
# ---------------------------------------------------------------------------

_MOSCOW_UTC_OFFSET = timedelta(hours=3)

# Маппинг interval_minutes → pandas freq-строка для resample
_RESAMPLE_FREQS: dict[int, str | None] = {
    1: None,       # raw — без ресэмплирования
    5: "5min",
    15: "15min",
    30: "30min",
    60: "1h",
    240: "4h",
    1440: "1D",
}


def _interval_to_freq(interval_minutes: int) -> str | None:
    """Вычислить pandas freq-строку для произвольного интервала в минутах."""
    if interval_minutes <= 1:
        return None
    cached = _RESAMPLE_FREQS.get(interval_minutes)
    if cached is not None:
        return cached
    if interval_minutes % 1440 == 0:
        return f"{interval_minutes // 1440}D"
    if interval_minutes % 60 == 0:
        return f"{interval_minutes // 60}h"
    return f"{interval_minutes}min"

_CSV_COLUMNS = ["datetime", "open", "high", "low", "close", "volume", "value"]


# ---------------------------------------------------------------------------
# Пути
# ---------------------------------------------------------------------------

def _candles_root() -> Path:
    """Корень хранилища свечей (настраивается через settings.CANDLES_ROOT)."""
    root = getattr(settings, "CANDLES_ROOT", None)
    if root:
        return Path(root)
    return Path(settings.BASE_DIR).parent / "uploads" / "candles"


def candle_dir(ticker: str, year: int, month: int) -> Path:
    """Директория ``{root}/{TICKER}/{YYYY}/{MM}``."""
    return _candles_root() / ticker.upper() / str(year) / f"{month:02d}"


def candle_path(ticker: str, dt: date) -> Path:
    """Путь к CSV файлу дневных свечей: ``…/{DD}.csv``."""
    return candle_dir(ticker, dt.year, dt.month) / f"{dt.day:02d}.csv"


def month_csv_count(ticker: str, year: int, month: int) -> int:
    """Количество CSV-файлов (дней) в директории месяца."""
    d = candle_dir(ticker, year, month)
    if not d.exists():
        return 0
    return len(list(d.glob("*.csv")))


# ---------------------------------------------------------------------------
# CSV — запись
# ---------------------------------------------------------------------------

def save_candles_to_csv(ticker: str, candles: list[dict[str, Any]]) -> int:
    """
    Сохранить свечи в daily CSV файлы (по дням).

    Если CSV за день уже существует — данные объединяются:
    concat → drop_duplicates(datetime, keep='last') → sort.

    Returns
    -------
    int
        Количество записанных файлов.
    """
    if not candles:
        return 0

    df = _normalize_candles_df(candles)
    if df.empty:
        return 0

    df["_date"] = df["datetime"].dt.date
    files_written = 0

    for day, group in df.groupby("_date"):
        day_df = group.drop(columns=["_date"])
        path = candle_path(ticker, day)

        if path.exists():
            try:
                existing = pd.read_csv(path, parse_dates=["datetime"])
                day_df = (
                    pd.concat([existing, day_df], ignore_index=True)
                    .drop_duplicates(subset=["datetime"], keep="last")
                    .sort_values("datetime")
                    .reset_index(drop=True)
                )
            except Exception as exc:
                logger.warning(
                    "Failed to read existing CSV %s, overwriting: %s",
                    path, exc,
                )

        path.parent.mkdir(parents=True, exist_ok=True)
        day_df.to_csv(path, index=False, columns=_CSV_COLUMNS)
        files_written += 1
        logger.debug("Saved %d candles to %s", len(day_df), path)

    logger.info(
        "save_candles_to_csv %s: wrote %d file(s) from %d candle(s)",
        ticker, files_written, len(candles),
    )
    return files_written


def _normalize_candles_df(candles: list[dict[str, Any]]) -> pd.DataFrame:
    """Нормализовать список словарей свечей → DataFrame со стандартными столбцами."""
    df = pd.DataFrame(candles)

    # Поддержка MOEX ISS (поле «begin») и стандартного «datetime»
    time_col = "begin" if "begin" in df.columns else "datetime"
    df["datetime"] = pd.to_datetime(df[time_col])

    # Стандартизировать имена столбцов
    rename_map: dict[str, str] = {}
    for src, dst in [("open", "open"), ("close", "close"),
                     ("high", "high"), ("low", "low"),
                     ("volume", "volume"), ("value", "value")]:
        if src in df.columns:
            rename_map[src] = dst

    df = df.rename(columns=rename_map)

    # Оставить только нужные столбцы
    missing = [c for c in _CSV_COLUMNS if c not in df.columns]
    if missing:
        logger.warning("Missing columns in candle data: %s", missing)
        for col in missing:
            df[col] = 0

    return df[_CSV_COLUMNS].copy()


# ---------------------------------------------------------------------------
# CSV — чтение
# ---------------------------------------------------------------------------

def read_candles(
    ticker: str,
    from_date: date,
    till_date: date,
) -> pd.DataFrame:
    """
    Прочитать свечи из CSV файлов за диапазон дат [from_date, till_date].

    Returns
    -------
    pd.DataFrame
        Столбцы: datetime, open, high, low, close, volume, value.
        Пустой DataFrame если данных нет.
    """
    frames: list[pd.DataFrame] = []
    current = from_date

    while current <= till_date:
        path = candle_path(ticker, current)
        if path.exists():
            try:
                df = pd.read_csv(path, parse_dates=["datetime"])
                frames.append(df)
            except Exception as exc:
                logger.warning("Failed to read %s: %s", path, exc)
        current += timedelta(days=1)

    if not frames:
        return pd.DataFrame(columns=_CSV_COLUMNS)

    result = pd.concat(frames, ignore_index=True).sort_values("datetime").reset_index(drop=True)

    # Фильтр по точным границам (файлы дневные, но from_date/till_date могут
    # быть неполными только по дням — на уровне дней гарантируем корректность)
    return result


# ---------------------------------------------------------------------------
# Ресэмплирование
# ---------------------------------------------------------------------------

def resample_candles(df: pd.DataFrame, interval_minutes: int) -> pd.DataFrame:
    """
    Пересэмплировать 1-мин свечи до заданного интервала.

    Parameters
    ----------
    df : pd.DataFrame
        Исходные свечи (столбец ``datetime`` должен быть datetime64).
    interval_minutes : int
        Целевой интервал в минутах (любое целое ≥ 1).

    Returns
    -------
    pd.DataFrame
        Пересэмплированные свечи (datetime как обычный столбец).
    """
    if df.empty:
        return df.copy()

    freq = _interval_to_freq(interval_minutes)
    if freq is None:
        return df.copy()

    tmp = df.set_index("datetime")

    resampled = tmp.resample(freq).agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
            "value": "sum",
        }
    ).dropna(subset=["open"])

    return resampled.reset_index()


# ---------------------------------------------------------------------------
# JSON для lightweight-charts
# ---------------------------------------------------------------------------

def candles_to_json(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Конвертировать DataFrame свечей в формат lightweight-charts.

    Московское время (UTC+3) преобразуется в UTC unix-timestamp (секунды).

    Returns
    -------
    list[dict]
        ``[{time: int, open: float, high: float, low: float, close: float, volume: int}, ...]``
    """
    if df.empty:
        return []

    records: list[dict[str, Any]] = []
    moscow_offset = _MOSCOW_UTC_OFFSET

    for _, row in df.iterrows():
        dt = pd.Timestamp(row["datetime"])

        # Считаем, что datetime — Moscow time (UTC+3).
        # Переводим в UTC, вычитая offset.
        utc_dt = dt - moscow_offset
        unix_ts = int(utc_dt.replace(tzinfo=timezone.utc).timestamp())

        records.append(
            {
                "time": unix_ts,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
        )

    return records
