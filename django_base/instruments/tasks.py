import logging
import time
from datetime import date, timedelta
from typing import Optional

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command

logger = logging.getLogger(__name__)


def _get_admin_token() -> str | None:
    """Получить расшифрованный T-Invest токен admin-пользователя."""
    from accounts.models import TraderProfile
    try:
        profile = TraderProfile.objects.select_related("user").get(
            user__username="admin"
        )
        token = profile.tinkoff_token
        return token if token else None
    except TraderProfile.DoesNotExist:
        return None


def _probe_tinkoff(token: str) -> None:
    """Проверка доступности T-Invest API."""
    from instruments.tinkoff_candles import validate_token
    if not validate_token(token):
        raise ConnectionError("T-Invest API: невалидный токен или сервис недоступен")


@shared_task(
    bind=True,
    time_limit=3600,
    soft_time_limit=3300,
)
def load_instruments_from_moex_task(
    self,
    instrument_type='STOCK',
    update_existing=False,
    limit=None,
):
    """Загрузка справочника инструментов с MOEX ISS (пока не переведена на T-Invest)."""
    logger.info(
        "load_instruments_from_moex_task: type=%s, update=%s, limit=%s",
        instrument_type, update_existing, limit,
    )
    args = ['load_instruments_from_moex', f'--instrument-type={instrument_type}']
    if update_existing:
        args.append('--update-existing')
    if limit is not None:
        args.extend(['--limit', str(limit)])
    call_command(*args)
    return {"status": "ok", "instrument_type": instrument_type}


_MONTH_COMPLETE_THRESHOLD = 10


@shared_task(
    bind=True,
    time_limit=7200,
    soft_time_limit=7000,
)
def load_candles_for_instrument(
    self,
    ticker: str,
    year: int | None = None,
    market: str = "stock",
    api_ticker: str | None = None,
):
    """Загрузка исторических свечей одного инструмента через T-Invest."""
    from instruments.candles import month_csv_count, save_candles_to_csv
    from instruments.tinkoff_candles import fetch_tinkoff_candles, resolve_instrument_uid

    token = _get_admin_token()
    if not token:
        logger.warning("load_candles_for_instrument: токен admin не задан, пропуск")
        return {"ticker": ticker, "status": "no_token"}

    year = year or date.today().year
    instrument_type = "FUTURES" if market == "futures" else "STOCK"
    uid = resolve_instrument_uid(token, api_ticker or ticker, instrument_type)
    if not uid:
        logger.error("load_candles: не удалось разрешить UID для %s", ticker)
        return {"ticker": ticker, "status": "uid_not_found"}

    total_candles = 0
    total_files = 0
    skipped = 0
    today = date.today()

    for month in range(1, 13):
        first_day = date(year, month, 1)
        if month == 12:
            last_day = date(year, 12, 31)
        else:
            last_day = date(year, month + 1, 1) - timedelta(days=1)

        if first_day > today:
            break

        if last_day > today:
            last_day = today

        if first_day < today.replace(day=1) and month_csv_count(ticker, year, month) >= _MONTH_COMPLETE_THRESHOLD:
            skipped += 1
            continue

        candles = fetch_tinkoff_candles(token, uid, first_day, last_day, interval=1)
        if candles:
            files = save_candles_to_csv(ticker, candles)
            total_candles += len(candles)
            total_files += files

        time.sleep(0.2)

    return {
        "ticker": ticker,
        "year": year,
        "candles": total_candles,
        "files": total_files,
        "skipped_months": skipped,
    }


@shared_task(bind=True, time_limit=3600, soft_time_limit=3300)
def load_all_candles(self, year: int | None = None):
    """Fan-out загрузка свечей для всех активных инструментов."""
    from instruments.models import Futures, Instrument

    year = year or date.today().year
    stocks = list(
        Instrument.objects.filter(is_active=True, instrument_type="STOCK")
        .values_list("ticker", flat=True)
    )
    futures = list(
        Futures.objects.filter(is_active=True)
        .exclude(secid="")
        .values_list("ticker", "secid")
    )

    for i, ticker in enumerate(stocks):
        load_candles_for_instrument.apply_async(
            kwargs={"ticker": ticker, "year": year, "market": "stock"},
            countdown=i * 3,
        )

    offset = len(stocks)
    for i, (ticker, secid) in enumerate(futures):
        load_candles_for_instrument.apply_async(
            kwargs={
                "ticker": ticker,
                "year": year,
                "market": "futures",
                "api_ticker": secid,
            },
            countdown=(offset + i) * 3,
        )

    return {"stocks": len(stocks), "futures": len(futures), "year": year}


@shared_task(bind=True)
def update_today_candles(self):
    """Периодическое обновление свечей за сегодня через T-Invest."""
    from instruments.candles import save_candles_to_csv
    from instruments.models import Futures, Instrument
    from instruments.tinkoff_candles import fetch_tinkoff_candles, resolve_instrument_uid

    token = _get_admin_token()
    if not token:
        logger.warning("update_today_candles: токен admin не задан, пропуск")
        return {"status": "no_token"}

    today = date.today()
    updated = 0
    errors = 0

    tickers: list[tuple[str, str, str]] = []

    for inst in Instrument.objects.filter(is_active=True, instrument_type="STOCK"):
        tickers.append((inst.ticker, inst.ticker, "STOCK"))

    for fut in Futures.objects.filter(is_active=True).exclude(secid=""):
        tickers.append((fut.ticker, fut.secid, "FUTURES"))

    total = len(tickers)

    for ticker, api_ticker, instrument_type in tickers:
        try:
            uid = resolve_instrument_uid(token, api_ticker, instrument_type)
            if not uid:
                logger.warning("update_today: UID не найден для %s", ticker)
                errors += 1
                continue

            candles = fetch_tinkoff_candles(token, uid, today, today, interval=1)
            if candles:
                save_candles_to_csv(ticker, candles)
                cache.delete_pattern(f"candles:{ticker}:*")
                updated += 1

            time.sleep(0.2)
        except Exception as exc:
            logger.error("update_today: ошибка %s: %s", ticker, exc)
            errors += 1

    logger.info(
        "update_today_candles: обновлено %d/%d, ошибок %d",
        updated, total, errors,
    )
    return {
        "date": today.isoformat(),
        "updated": updated,
        "total": total,
        "errors": errors,
    }
