import logging
import time
from typing import Optional

import requests
from celery import shared_task
from django.conf import settings
from django.core.management import call_command


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

    command_kwargs: dict = {}

    if instrument_type:
        command_kwargs["instrument_type"] = instrument_type

    if update_existing:
        command_kwargs["update_existing"] = True

    if limit is not None:
        command_kwargs["limit"] = limit

    call_command("load_instruments_from_moex", **command_kwargs)
