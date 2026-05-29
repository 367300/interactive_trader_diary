import logging
import time
from datetime import date, datetime, timedelta
from typing import Optional

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from instruments.candles import save_candles_to_csv
from instruments.candles_gaps import find_missing_ranges
from instruments.tinkoff_candles import fetch_tinkoff_candles, resolve_instrument_uid

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


# ---------------------------------------------------------------------------
# Унифицированная задача синхронизации свечей с прогрессом в Channels
# ---------------------------------------------------------------------------

def _publish(layer, group, event):
    async_to_sync(layer.group_send)(group, event)


def _state_key(ticker: str) -> str:
    return f"candles:sync_state:{ticker.upper()}"


def _lock_key(ticker: str) -> str:
    return f"candles:sync_lock:{ticker.upper()}"


def _release_lock(ticker: str) -> None:
    cache.delete(_lock_key(ticker))
    cache.delete(_state_key(ticker))


def _run_sync_candles(
    self,
    ticker: str,
    *,
    market: str = "stock",
    api_ticker: str | None = None,
    start: str | None = None,
    end: str | None = None,
    triggered_by: int | None = None,
):
    """Реализация унифицированной задачи догрузки свечей одного инструмента.

    Plain-функция, чтобы тесты могли вызывать её с произвольным mock-объектом
    self. Celery-обёртка ниже регистрирует её как задачу
    ``sync_candles_for_instrument`` для apply_async/delay.
    """
    ticker = ticker.upper()
    group = f"candles_sync_{ticker}"
    layer = get_channel_layer()
    task_id = getattr(self.request, "id", None) or "unknown"
    started = time.monotonic()

    def _error(message: str) -> dict:
        event = {"type": "sync.error", "task_id": task_id, "message": message}
        _publish(layer, group, event)
        _release_lock(ticker)
        return {"ticker": ticker, "status": message}

    token = _get_admin_token()
    if not token:
        return _error("no_token")

    instrument_type = "FUTURES" if market == "futures" else "STOCK"
    uid = resolve_instrument_uid(token, api_ticker or ticker, instrument_type)
    if not uid:
        return _error("uid_not_found")

    ranges = find_missing_ranges(
        ticker,
        start=date.fromisoformat(start) if start else None,
        end=date.fromisoformat(end) if end else None,
    )

    total = len(ranges)
    cumulative = 0
    errors = 0

    try:
        for i, gap in enumerate(ranges, 1):
            try:
                candles = fetch_tinkoff_candles(token, uid, gap.from_date, gap.till_date, interval=1)
                if candles:
                    save_candles_to_csv(ticker, candles)
                    cache.delete_pattern(f"candles:{ticker}:*")
                    cache.delete(f"candles:last_saved:{ticker}")
                    cumulative += len(candles)

                event = {
                    "type": "sync.progress",
                    "task_id": task_id,
                    "done_ranges": i,
                    "total_ranges": total,
                    "range_from": gap.from_date.isoformat(),
                    "range_till": gap.till_date.isoformat(),
                    "range_candles": len(candles),
                    "cumulative_candles": cumulative,
                }
                cache.set(_state_key(ticker), event, 86400)
                _publish(layer, group, event)
                time.sleep(0.2)
            except SoftTimeLimitExceeded:
                raise
            except Exception as exc:
                logger.error("sync_candles %s %s-%s: %s", ticker, gap.from_date, gap.till_date, exc)
                errors += 1
    except SoftTimeLimitExceeded:
        _publish(layer, group, {"type": "sync.error", "task_id": task_id, "message": "timeout"})
        _release_lock(ticker)
        return {"ticker": ticker, "status": "timeout", "cumulative_candles": cumulative}

    duration = round(time.monotonic() - started, 1)
    done = {
        "type": "sync.done",
        "task_id": task_id,
        "total_ranges": total,
        "cumulative_candles": cumulative,
        "duration_s": duration,
        "errors": errors,
    }
    _publish(layer, group, done)
    _release_lock(ticker)
    return {
        "ticker": ticker,
        "total_ranges": total,
        "cumulative_candles": cumulative,
        "errors": errors,
        "duration_s": duration,
    }


sync_candles_for_instrument = shared_task(
    bind=True,
    name="instruments.tasks.sync_candles_for_instrument",
    time_limit=7200,
    soft_time_limit=7000,
)(_run_sync_candles)
