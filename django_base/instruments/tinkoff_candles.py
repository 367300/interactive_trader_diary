"""
Получение свечей и разрешение инструментов через T-Invest API (gRPC SDK).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from django.core.cache import cache
from tinkoff.invest import (
    CandleInterval,
    Client,
    InstrumentIdType,
)
from tinkoff.invest.schemas import Quotation

logger = logging.getLogger(__name__)

INTERVAL_MAP: dict[int, CandleInterval] = {
    1: CandleInterval.CANDLE_INTERVAL_1_MIN,
    5: CandleInterval.CANDLE_INTERVAL_5_MIN,
    15: CandleInterval.CANDLE_INTERVAL_15_MIN,
    30: CandleInterval.CANDLE_INTERVAL_30_MIN,
    60: CandleInterval.CANDLE_INTERVAL_HOUR,
    240: CandleInterval.CANDLE_INTERVAL_4_HOUR,
    1440: CandleInterval.CANDLE_INTERVAL_DAY,
}

_UID_CACHE_TTL = 86400  # 24 часа


def _q(quotation: Quotation) -> float:
    """Quotation (units + nano) → float."""
    return quotation.units + quotation.nano / 1_000_000_000


def validate_token(token: str) -> bool:
    """Проверить токен лёгким запросом GetAccounts."""
    try:
        with Client(token) as client:
            client.users.get_accounts()
        return True
    except Exception:
        return False


def resolve_instrument_uid(
    token: str,
    ticker: str,
    instrument_type: str = "STOCK",
    *,
    class_code: str | None = None,
) -> str | None:
    """
    Получить T-Invest instrument_uid по тикеру.

    Сначала проверяет Redis-кеш, затем БД (поле tinkoff_uid),
    затем запрашивает через SDK и сохраняет результат.
    """
    cache_key = f"tinvest:uid:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from instruments.models import Futures, Instrument

    if instrument_type == "FUTURES":
        obj = Futures.objects.filter(ticker=ticker).first()
    else:
        obj = Instrument.objects.filter(ticker=ticker).first()

    if obj and obj.tinkoff_uid:
        cache.set(cache_key, obj.tinkoff_uid, _UID_CACHE_TTL)
        return obj.tinkoff_uid

    uid = _fetch_uid_from_api(token, ticker, instrument_type, class_code)
    if uid:
        cache.set(cache_key, uid, _UID_CACHE_TTL)
        if obj:
            type(obj).objects.filter(pk=obj.pk).update(tinkoff_uid=uid)
    return uid


def _fetch_uid_from_api(
    token: str,
    ticker: str,
    instrument_type: str,
    class_code: str | None,
) -> str | None:
    """Запрос UID через T-Invest SDK."""
    try:
        with Client(token) as client:
            if instrument_type == "FUTURES":
                resp = client.instruments.future_by(
                    id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_TICKER,
                    class_code=class_code or "SPBFUT",
                    id=ticker,
                )
                return resp.instrument.uid
            else:
                resp = client.instruments.share_by(
                    id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_TICKER,
                    class_code=class_code or "TQBR",
                    id=ticker,
                )
                return resp.instrument.uid
    except Exception as exc:
        logger.warning("T-Invest resolve_uid failed for %s: %s", ticker, exc)
        return None


def fetch_tinkoff_candles(
    token: str,
    uid: str,
    from_date: date,
    till_date: date,
    interval: int = 1,
) -> list[dict[str, Any]]:
    """
    Загрузить свечи через T-Invest API.

    Возвращает list[dict] в формате, совместимом с save_candles_to_csv:
    {datetime, open, high, low, close, volume, value}
    """
    candle_interval = INTERVAL_MAP.get(interval, CandleInterval.CANDLE_INTERVAL_1_MIN)

    from_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc)
    to_dt = datetime.combine(till_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    result: list[dict[str, Any]] = []
    try:
        with Client(token) as client:
            candles = client.market_data.get_all_candles(
                instrument_id=uid,
                from_=from_dt,
                to=to_dt,
                interval=candle_interval,
            )
            for c in candles:
                msk_time = c.time + timedelta(hours=3)
                result.append({
                    "datetime": msk_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "open": _q(c.open),
                    "high": _q(c.high),
                    "low": _q(c.low),
                    "close": _q(c.close),
                    "volume": c.volume,
                    "value": 0,
                })
    except Exception as exc:
        logger.error("T-Invest candles failed for uid=%s: %s", uid, exc)

    return result
