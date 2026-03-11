from typing import Optional

import requests
from celery import shared_task
from django.core.management import call_command


# Проверочный URL API Мосбиржи (лёгкий запрос)
_MOEX_CHECK_URL = "https://iss.moex.com/iss/engines/stock/markets/shares/securities.json"
_MOEX_CHECK_PARAMS = {"iss.meta": "off", "limit": "1"}


@shared_task(
    bind=True,
    time_limit=3600,   # жёсткий лимит 1 час
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
    Перед запуском проверяет доступность API Мосбиржи из контейнера воркера.
    """
    # Быстрая проверка: может ли воркер достучаться до API Мосбиржи
    try:
        requests.get(
            _MOEX_CHECK_URL,
            params=_MOEX_CHECK_PARAMS,
            timeout=15,
        ).raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(
            f"Не удалось подключиться к API Мосбиржи из контейнера Celery. "
            f"Проверьте исходящий доступ в интернет (сеть/DNS). Ошибка: {e}"
        ) from e

    command_kwargs: dict = {}

    if instrument_type:
        command_kwargs["instrument_type"] = instrument_type

    if update_existing:
        command_kwargs["update_existing"] = True

    if limit is not None:
        command_kwargs["limit"] = limit

    call_command("load_instruments_from_moex", **command_kwargs)

