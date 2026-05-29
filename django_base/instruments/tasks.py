import logging
import time
from datetime import date

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


@shared_task(bind=True, time_limit=7200, soft_time_limit=7000)
def load_candles_for_instrument(
    self,
    ticker: str,
    year: int | None = None,
    market: str = "stock",
    api_ticker: str | None = None,
):
    """Совместимая обёртка: год → диапазон [01-01, 12-31] (но не дальше today)."""
    year = year or date.today().year
    start = date(year, 1, 1)
    end = min(date(year, 12, 31), date.today())
    return _run_sync_candles(
        self,
        ticker=ticker,
        market=market,
        api_ticker=api_ticker,
        start=start.isoformat(),
        end=end.isoformat(),
    )


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
    """Периодический tick: fan-out sync с start=end=today для всех активных тикеров."""
    from instruments.models import Futures, Instrument

    today_iso = date.today().isoformat()
    targets: list[tuple[str, str, str]] = []
    for inst in Instrument.objects.filter(is_active=True, instrument_type="STOCK"):
        targets.append((inst.ticker.upper(), inst.ticker, "stock"))
    for fut in Futures.objects.filter(is_active=True).exclude(secid=""):
        targets.append((fut.ticker.upper(), fut.secid, "futures"))

    for i, (ticker, api_ticker, market) in enumerate(targets):
        sync_candles_for_instrument.apply_async(
            kwargs={
                "ticker": ticker,
                "api_ticker": api_ticker,
                "market": market,
                "start": today_iso,
                "end": today_iso,
            },
            countdown=i * 1,
        )

    return {"total": len(targets), "date": today_iso}


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
