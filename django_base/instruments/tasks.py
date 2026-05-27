import logging
import time
from datetime import date, timedelta
from typing import Optional

import requests
from celery import shared_task
from django.conf import settings
from django.core.management import call_command

from instruments.moex_candles import MOEX_HTTP_HEADERS


logger = logging.getLogger(__name__)

# Проверочные URL API Мосбиржи (лёгкие запросы)
_MOEX_STOCK_CHECK_URL = "https://iss.moex.com/iss/engines/stock/markets/shares/securities.json"
_MOEX_STOCK_CHECK_PARAMS = {"iss.meta": "off", "limit": "1"}
_MOEX_FUTURES_CHECK_URL = (
    "https://iss.moex.com/iss/engines/futures/markets/forts/securities.json"
)
_MOEX_FUTURES_CHECK_PARAMS = {"iss.meta": "off", "limit": "1", "iss.only": "securities"}


def _probe_moex(check_url: str, check_params: dict) -> None:
    """Несколько попыток с паузой — холодный DNS/сеть в Docker иногда отвечает со второго раза."""
    timeout = getattr(settings, "MOEX_LOAD_CONNECTIVITY_TIMEOUT", 45)
    retries = max(1, getattr(settings, "MOEX_LOAD_CONNECTIVITY_RETRIES", 3))
    last_exc: Optional[Exception] = None
    for attempt in range(retries):
        try:
            response = requests.get(
                check_url,
                params=check_params,
                headers=MOEX_HTTP_HEADERS,
                timeout=timeout,
            )
            response.raise_for_status()
            if attempt > 0:
                logger.info(
                    "MOEX connectivity OK после попытки %s/%s",
                    attempt + 1,
                    retries,
                )
            return
        except requests.RequestException as e:
            last_exc = e
            logger.warning(
                "MOEX connectivity попытка %s/%s не удалась: %s",
                attempt + 1,
                retries,
                e,
            )
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
    assert last_exc is not None
    raise last_exc


@shared_task(
    bind=True,
    time_limit=3600,  # жёсткий лимит 1 час
    soft_time_limit=3300,  # мягкий лимит 55 мин, чтобы успеть завершиться
)
def load_instruments_from_moex_task(
    self,
    instrument_type: str = "STOCK",
    update_existing: bool = False,
    limit: Optional[int] = None,
) -> None:
    """
    Celery-задача для запуска management-команды load_instruments_from_moex.

    Выносит тяжелую загрузку инструментов в фон, чтобы не блокировать веб-запрос.
    По умолчанию перед запуском проверяет доступность API Мосбиржи из воркера
    (можно отключить: MOEX_LOAD_SKIP_CONNECTIVITY_CHECK=1 в .env).
    """
    if instrument_type == "FUTURES":
        check_url = _MOEX_FUTURES_CHECK_URL
        check_params = _MOEX_FUTURES_CHECK_PARAMS
    else:
        check_url = _MOEX_STOCK_CHECK_URL
        check_params = _MOEX_STOCK_CHECK_PARAMS

    if getattr(settings, "MOEX_LOAD_SKIP_CONNECTIVITY_CHECK", False):
        logger.info("MOEX connectivity check пропущен (MOEX_LOAD_SKIP_CONNECTIVITY_CHECK)")
    else:
        try:
            _probe_moex(check_url, check_params)
        except requests.RequestException as e:
            raise RuntimeError(
                "Не удалось подключиться к API Мосбиржи из контейнера Celery. "
                "Проверьте исходящий HTTPS (файрвол, DNS в Docker/WSL). "
                "Для dev можно задать в .env: MOEX_LOAD_SKIP_CONNECTIVITY_CHECK=True "
                "(команда всё равно не выполнится без доступа к сети). "
                f"Ошибка: {e}"
            ) from e

    # Если CSV обогащения существует — сначала загрузить таксономию отраслей,
    # чтобы load_instruments_from_moex мог привязать SubIndustry к инструментам.
    from instruments.management.commands.load_industry_taxonomy_from_moex_csv import Command as TaxCmd
    csv_path = TaxCmd._resolve_csv_path(None)
    if csv_path.exists():
        logger.info("CSV обогащения найден (%s), загружаем таксономию отраслей", csv_path)
        call_command("load_industry_taxonomy_from_moex_csv")

    command_kwargs: dict = {}

    if instrument_type:
        command_kwargs["instrument_type"] = instrument_type

    if update_existing:
        command_kwargs["update_existing"] = True

    if limit is not None:
        command_kwargs["limit"] = limit

    call_command("load_instruments_from_moex", **command_kwargs)


_MONTH_COMPLETE_THRESHOLD = 10


@shared_task(bind=True, time_limit=7200, soft_time_limit=7000)
def load_candles_for_instrument(
    self,
    ticker: str,
    year: int | None = None,
    market: str = "stock",
    api_ticker: str | None = None,
) -> dict:
    """Load 1-min candles from MOEX ISS API for a single instrument and year.

    Fetches month by month to keep response sizes manageable.
    Skips past months that already have sufficient CSV data (≥10 files).

    ``api_ticker`` — тикер для запроса к MOEX ISS (SECID для фьючерсов).
    Если не указан, используется ``ticker``.
    """
    from instruments.moex_candles import (
        fetch_moex_candles,
        month_csv_count,
        save_candles_to_csv,
    )

    if api_ticker is None:
        api_ticker = ticker

    if year is None:
        year = date.today().year

    today = date.today()
    total_candles = 0
    total_files = 0
    skipped_months = 0

    for month in range(1, 13):
        from_date = date(year, month, 1)
        if month == 12:
            till_date = date(year, 12, 31)
        else:
            till_date = date(year, month + 1, 1) - timedelta(days=1)

        if from_date > today:
            break
        if till_date > today:
            till_date = today

        is_current_month = (year == today.year and month == today.month)
        if not is_current_month:
            existing = month_csv_count(ticker, year, month)
            if existing >= _MONTH_COMPLETE_THRESHOLD:
                logger.debug(
                    "Skipping %s %d-%02d: already has %d CSV files",
                    ticker, year, month, existing,
                )
                skipped_months += 1
                continue

        logger.info("Fetching %s candles: %s to %s", ticker, from_date, till_date)
        candles = fetch_moex_candles(api_ticker, from_date, till_date, market=market)
        total_candles += len(candles)

        files = save_candles_to_csv(ticker, candles)
        total_files += files

    logger.info(
        "Done loading %s for %d: %d candles, %d files, %d months skipped",
        ticker, year, total_candles, total_files, skipped_months,
    )
    return {
        "ticker": ticker,
        "year": year,
        "candles": total_candles,
        "files": total_files,
        "skipped_months": skipped_months,
    }


@shared_task(bind=True, time_limit=3600, soft_time_limit=3300)
def load_all_candles(self, year: int | None = None) -> dict:
    """Fan out candle loading for all active stocks and futures.

    Staggers tasks with 3-second delays to be respectful to MOEX API.
    """
    from instruments.models import Futures, Instrument

    if year is None:
        year = date.today().year

    stocks = list(
        Instrument.objects.filter(
            is_active=True,
            instrument_type=Instrument.InstrumentType.STOCK,
        ).values_list("ticker", flat=True)
    )
    futures_qs = Futures.objects.filter(
        is_active=True, secid__gt="",
    ).values_list("ticker", "secid")

    all_tasks: list[tuple[str, str, str]] = []
    all_tasks.extend((t, t, "stock") for t in stocks)
    all_tasks.extend((ticker, secid, "futures") for ticker, secid in futures_qs)

    for i, (ticker, api_ticker, market) in enumerate(all_tasks):
        load_candles_for_instrument.apply_async(
            args=[ticker, year],
            kwargs={"market": market, "api_ticker": api_ticker},
            countdown=i * 3,
        )

    futures_count = len(all_tasks) - len(stocks)
    logger.info(
        "Dispatched candle loading: %d stocks + %d futures, year %d",
        len(stocks), futures_count, year,
    )
    return {
        "dispatched_stocks": len(stocks),
        "dispatched_futures": futures_count,
        "year": year,
    }


@shared_task(bind=True, time_limit=3600, soft_time_limit=3300)
def update_today_candles(self) -> dict:
    """Periodic task: fetch today's candles for all active stocks and futures.

    Runs every 30 minutes via Celery Beat.
    Invalidates Redis cache after updating each instrument.
    """
    from django.core.cache import cache
    from instruments.models import Futures, Instrument
    from instruments.moex_candles import fetch_moex_candles, save_candles_to_csv

    today = date.today()
    stocks = list(
        Instrument.objects.filter(
            is_active=True,
            instrument_type=Instrument.InstrumentType.STOCK,
        ).values_list("ticker", flat=True)
    )
    futures_qs = list(
        Futures.objects.filter(
            is_active=True, secid__gt="",
        ).values_list("ticker", "secid")
    )

    # (ticker_for_csv, ticker_for_api, market)
    all_tickers: list[tuple[str, str, str]] = []
    all_tickers.extend((t, t, "stock") for t in stocks)
    all_tickers.extend((ticker, secid, "futures") for ticker, secid in futures_qs)

    updated = 0
    for i, (ticker, api_ticker, market) in enumerate(all_tickers):
        try:
            candles = fetch_moex_candles(api_ticker, today, today, market=market)
            if candles:
                save_candles_to_csv(ticker, candles)
                cache.delete_pattern(f"candles:{ticker}:*")
                updated += 1
        except Exception as e:
            logger.error("Failed to update candles for %s: %s", ticker, e)

        if i < len(all_tickers) - 1:
            time.sleep(0.5)

    logger.info(
        "Updated today's candles for %d/%d tickers (%d stocks + %d futures)",
        updated, len(all_tickers), len(stocks), len(futures_qs),
    )
    return {
        "updated": updated,
        "total": len(all_tickers),
        "stocks": len(stocks),
        "futures": len(futures_qs),
        "date": today.isoformat(),
    }
