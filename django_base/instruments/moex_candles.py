"""
Утилиты для получения, хранения и обработки свечей MOEX ISS.

Функции:
- fetch_moex_candles  — загрузка 1-мин OHLCV свечей с пагинацией
- save_candles_to_csv — сохранение свечей в CSV (по дням)
- read_candles        — чтение свечей из CSV за диапазон дат
- resample_candles    — пересэмплирование до 5m/15m/30m/1h/4h/1D
- candles_to_json     — конвертация DataFrame → JSON для lightweight-charts
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Константы
# ---------------------------------------------------------------------------

_MOEX_CANDLES_URLS = {
    "stock": (
        "https://iss.moex.com/iss/engines/stock/markets/shares"
        "/boards/TQBR/securities/{ticker}/candles.json"
    ),
    "futures": (
        "https://iss.moex.com/iss/engines/futures/markets/forts"
        "/securities/{ticker}/candles.json"
    ),
}

_MOEX_PAGE_SIZE = 500

MOEX_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
}

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
# Загрузка с MOEX ISS
# ---------------------------------------------------------------------------

def fetch_moex_candles(
    ticker: str,
    from_date: date,
    till_date: date,
    interval: int = 1,
    request_delay: float = 0.3,
    market: str = "stock",
) -> list[dict[str, Any]]:
    """
    Загрузить свечи с MOEX ISS API с автоматической пагинацией.

    Parameters
    ----------
    ticker : str
        Тикер инструмента (например «SBER» или «SiM6»).
    from_date, till_date : date
        Диапазон дат (включительно).
    interval : int
        Интервал свечей MOEX (1 = 1 мин, 10 = 10 мин, 60 = 1 ч, 24 = 1 д).
    request_delay : float
        Пауза между запросами для rate-limit.
    market : str
        Рынок MOEX: ``"stock"`` (акции) или ``"futures"`` (фьючерсы).

    Returns
    -------
    list[dict]
        Список словарей с ключами:
        open, close, high, low, value, volume, begin, end.
    """
    url_template = _MOEX_CANDLES_URLS.get(market, _MOEX_CANDLES_URLS["stock"])
    url = url_template.format(ticker=ticker.upper())
    params: dict[str, str | int] = {
        "from": from_date.isoformat(),
        "till": till_date.isoformat(),
        "interval": interval,
        "iss.meta": "off",
        "start": 0,
    }

    all_candles: list[dict[str, Any]] = []
    page = 0

    while True:
        params["start"] = page * _MOEX_PAGE_SIZE
        try:
            resp = requests.get(url, params=params, headers=MOEX_HTTP_HEADERS, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.error(
                "MOEX candles request failed for %s (page %d): %s",
                ticker, page, exc,
            )
            break

        try:
            body = resp.json()
            columns: list[str] = body["candles"]["columns"]
            data: list[list] = body["candles"]["data"]
        except (KeyError, ValueError) as exc:
            logger.error(
                "MOEX candles: unexpected response structure for %s: %s",
                ticker, exc,
            )
            break

        if not data:
            break

        for row in data:
            all_candles.append(dict(zip(columns, row)))

        logger.debug(
            "MOEX candles %s page %d: got %d rows (total %d)",
            ticker, page, len(data), len(all_candles),
        )

        if len(data) < _MOEX_PAGE_SIZE:
            break

        page += 1
        if request_delay > 0:
            time.sleep(request_delay)

    logger.info(
        "MOEX candles %s %s..%s interval=%d: fetched %d candles",
        ticker, from_date, till_date, interval, len(all_candles),
    )
    return all_candles


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

    df = _candles_list_to_df(candles)
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


def _candles_list_to_df(candles: list[dict[str, Any]]) -> pd.DataFrame:
    """Преобразовать список словарей MOEX ISS → нормализованный DataFrame."""
    df = pd.DataFrame(candles)

    # MOEX ISS возвращает «begin» как timestamp свечи
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
