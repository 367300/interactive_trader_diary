# Admin Candle Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-29-admin-candle-sync-design.md`

**Goal:** Админ-кнопка на любом графике, которая догружает только недостающие свечи одного инструмента с real-time прогрессом через WebSocket; та же gap-логика переиспользуется в bulk-задачах.

**Architecture:** Единый модуль gap-резолвера читает CSV-структуру и возвращает список пропущенных диапазонов. Унифицированная Celery-задача `sync_candles_for_instrument` обходит диапазоны, шлёт прогресс в Channels group по тикеру и инвалидирует кеш. Старые задачи (`load_candles_for_instrument`, `update_today_candles`) становятся обёртками над ней. Frontend подписывается на WebSocket с JWT в query-string, дебаунсит refetch графика и показывает прогресс в admin-only кнопке.

**Tech Stack:** Django 5.2 + DRF + Channels 4 + Celery + django-redis + Redis. React 18 + Vite + Vitest + lightweight-charts + Tailwind/shadcn. JWT через simplejwt.

**Conventions used in this plan:**
- Backend тесты — Django `TestCase` / `TransactionTestCase` / `channels.testing.WebsocketCommunicator` (запуск: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.<...>`). Базовый `instruments/tests.py` пустой — будет заменён на пакет `instruments/tests/`.
- Frontend тесты — Vitest + Testing Library (запуск: `cd frontend && npm test -- --run <pattern>`).
- Коммиты на русском, Conventional Commits (см. CLAUDE.md). Каждый шаг с коммитом — отдельный логический инкремент.
- Все ленивые импорты внутри функций — следуют существующему стилю `instruments/tasks.py`.

---

## Phase 0: Подготовка

### Task 0: Создать ветку и тестовый пакет

**Files:**
- Modify: текущая git ветка
- Create: `django_base/instruments/tests/__init__.py`
- Delete: `django_base/instruments/tests.py`

- [ ] **Step 1: Создать feature-ветку**

```bash
git checkout main
git pull
git checkout -b feature/admin-candle-sync
```

- [ ] **Step 2: Превратить `instruments/tests.py` в пакет**

```bash
rm django_base/instruments/tests.py
mkdir -p django_base/instruments/tests
touch django_base/instruments/tests/__init__.py
```

- [ ] **Step 3: Прогнать существующие тесты для baseline**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test`
Expected: PASS (или такое же состояние как до изменений).

- [ ] **Step 4: Commit**

```bash
git add django_base/instruments/tests/__init__.py
git rm django_base/instruments/tests.py
git commit -m "chore(instruments): преобразовать tests.py в пакет tests/"
```

---

## Phase 1: Gap-резолвер (backend)

### Task 1: Settings — `CANDLES_HISTORY_START_YEAR`

**Files:**
- Modify: `django_base/django_base/settings.py` (в конце файла или рядом с другими прикладными настройками)

- [ ] **Step 1: Добавить настройку**

```python
# === Свечи: глубина истории по умолчанию ===
from datetime import date as _date_for_settings
CANDLES_HISTORY_START_YEAR = config(
    "CANDLES_HISTORY_START_YEAR",
    default=_date_for_settings.today().year,
    cast=int,
)
CANDLES_SYNC_LOCK_TTL = 21600  # 6 часов
```

(если в файле уже есть импорт `from datetime import date` — используем его и удаляем алиас `_date_for_settings`).

- [ ] **Step 2: Запустить Django check**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py check`
Expected: `System check identified no issues`.

- [ ] **Step 3: Commit**

```bash
git add django_base/django_base/settings.py
git commit -m "feat(settings): CANDLES_HISTORY_START_YEAR и CANDLES_SYNC_LOCK_TTL"
```

---

### Task 2: `candles_gaps.last_saved_candle_dt`

**Files:**
- Create: `django_base/instruments/candles_gaps.py`
- Create: `django_base/instruments/tests/test_candles_gaps.py`

- [ ] **Step 1: Написать падающий тест на last_saved_candle_dt**

```python
# django_base/instruments/tests/test_candles_gaps.py
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from django.test import TestCase, override_settings


def _write_csv(root: Path, ticker: str, day: date, times: list[str]) -> None:
    p = root / ticker.upper() / str(day.year) / f"{day.month:02d}" / f"{day.day:02d}.csv"
    p.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame({
        "datetime": [f"{day.isoformat()} {t}" for t in times],
        "open": [100.0] * len(times),
        "high": [101.0] * len(times),
        "low": [99.0] * len(times),
        "close": [100.5] * len(times),
        "volume": [10] * len(times),
        "value": [1000] * len(times),
    })
    df.to_csv(p, index=False)


class LastSavedCandleDtTests(TestCase):
    def setUp(self):
        self.root = Path(self._testMethodName + "_tmp").resolve()
        if self.root.exists():
            import shutil
            shutil.rmtree(self.root)
        self.root.mkdir(parents=True)
        self.addCleanup(lambda: __import__("shutil").rmtree(self.root, ignore_errors=True))

    def test_returns_none_when_no_files(self):
        from instruments import candles_gaps
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()  # очистим кеш
            self.assertIsNone(candles_gaps.last_saved_candle_dt("SBER"))

    def test_returns_max_datetime_from_latest_day(self):
        from instruments import candles_gaps
        _write_csv(self.root, "SBER", date(2026, 5, 20), ["10:00:00", "10:01:00"])
        _write_csv(self.root, "SBER", date(2026, 5, 22), ["18:00:00", "23:49:00"])
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            dt = candles_gaps.last_saved_candle_dt("SBER")
        self.assertEqual(dt, datetime(2026, 5, 22, 23, 49, 0))
```

- [ ] **Step 2: Запустить тест — должен упасть (модуля нет)**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_candles_gaps -v 2`
Expected: ImportError / ModuleNotFoundError для `instruments.candles_gaps`.

- [ ] **Step 3: Реализовать `last_saved_candle_dt`**

```python
# django_base/instruments/candles_gaps.py
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
    # cache.delete_pattern доступен через django_redis backend
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
    """Найти последний сохранённый timestamp в CSV-файлах тикера.

    Кешируется в Redis под ключом ``candles:last_saved:{ticker}`` на 60 секунд.
    Используется gap-резолвером и при возможной очистке после save.
    """
    ticker = ticker.upper()
    cached = cache.get(_last_saved_cache_key(ticker))
    if cached is not None:
        # сохраняем как ISO в кеше — Redis JSON-serializable
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
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_candles_gaps.LastSavedCandleDtTests -v 2`
Expected: PASS обоих тестов.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/candles_gaps.py django_base/instruments/tests/test_candles_gaps.py
git commit -m "feat(instruments): last_saved_candle_dt и каркас candles_gaps"
```

---

### Task 3: `candles_gaps.find_missing_ranges`

**Files:**
- Modify: `django_base/instruments/candles_gaps.py`
- Modify: `django_base/instruments/tests/test_candles_gaps.py`

- [ ] **Step 1: Написать падающие тесты на 5 сценариев**

Добавить к существующему файлу тестов:

```python
class FindMissingRangesTests(TestCase):
    def setUp(self):
        self.root = Path(f"_gaps_{self._testMethodName}_tmp").resolve()
        if self.root.exists():
            import shutil
            shutil.rmtree(self.root)
        self.root.mkdir(parents=True)
        self.addCleanup(lambda: __import__("shutil").rmtree(self.root, ignore_errors=True))

    def test_empty_storage_returns_full_range(self):
        from instruments import candles_gaps
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            ranges = candles_gaps.find_missing_ranges(
                "SBER",
                start=date(2026, 5, 4),   # понедельник
                end=date(2026, 5, 8),     # пятница
            )
        # ровно один range, покрывающий всю неделю
        self.assertEqual(len(ranges), 1)
        self.assertEqual(ranges[0].from_date, date(2026, 5, 4))
        self.assertEqual(ranges[0].till_date, date(2026, 5, 8))
        self.assertEqual(ranges[0].reason, "missing_days")

    def test_weekends_skipped(self):
        from instruments import candles_gaps
        # понедельник 4, вторник 5, среда 6, чт 7, пт 8, сб 9, вс 10, пн 11
        # покрываем только пн+пт. Пропуск = 5-7, выходные не считаются.
        _write_csv(self.root, "SBER", date(2026, 5, 4), ["10:00:00"])
        _write_csv(self.root, "SBER", date(2026, 5, 8), ["10:00:00"])
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            ranges = candles_gaps.find_missing_ranges(
                "SBER",
                start=date(2026, 5, 4),
                end=date(2026, 5, 10),  # вс — конец недели
            )
        # ожидаем один range вт-чт (5..7) — выходные пропущены
        gap_ranges = [r for r in ranges if r.reason == "missing_days"]
        self.assertEqual(len(gap_ranges), 1)
        self.assertEqual(gap_ranges[0].from_date, date(2026, 5, 5))
        self.assertEqual(gap_ranges[0].till_date, date(2026, 5, 7))

    def test_middle_gap_grouped(self):
        from instruments import candles_gaps
        for d in (date(2026, 5, 4), date(2026, 5, 5), date(2026, 5, 8)):
            _write_csv(self.root, "SBER", d, ["10:00:00"])
        # пропущены 6, 7
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            ranges = candles_gaps.find_missing_ranges(
                "SBER",
                start=date(2026, 5, 4),
                end=date(2026, 5, 8),
            )
        missing = [r for r in ranges if r.reason == "missing_days"]
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0].from_date, date(2026, 5, 6))
        self.assertEqual(missing[0].till_date, date(2026, 5, 7))

    def test_tail_after_last_saved(self):
        from instruments import candles_gaps
        # последний сохранённый timestamp = 22 мая (пт) 18:00
        _write_csv(self.root, "SBER", date(2026, 5, 22), ["18:00:00"])
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            ranges = candles_gaps.find_missing_ranges(
                "SBER",
                start=date(2026, 5, 22),
                end=date(2026, 5, 25),  # пн
            )
        tail = [r for r in ranges if r.reason == "tail"]
        self.assertEqual(len(tail), 1)
        self.assertEqual(tail[0].from_date, date(2026, 5, 22))
        self.assertEqual(tail[0].till_date, date(2026, 5, 25))

    def test_no_gap_when_everything_covered_until_today(self):
        from instruments import candles_gaps
        # покрываем будний диапазон полностью + сегодня (но сегодня может быть выходной)
        _write_csv(self.root, "SBER", date(2026, 5, 4), ["23:49:00"])
        _write_csv(self.root, "SBER", date(2026, 5, 5), ["23:49:00"])
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            ranges = candles_gaps.find_missing_ranges(
                "SBER",
                start=date(2026, 5, 4),
                end=date(2026, 5, 5),
            )
        # last_saved уже совпадает с концом периода → ни missing_days, ни tail
        self.assertEqual(ranges, [])
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_candles_gaps.FindMissingRangesTests -v 2`
Expected: AttributeError / NameError на `find_missing_ranges`.

- [ ] **Step 3: Реализовать `find_missing_ranges`**

Добавить в `instruments/candles_gaps.py`:

```python
def _iter_trading_days(start: date, end: date):
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # Mon-Fri
            yield cur
        cur += timedelta(days=1)


def _group_consecutive_days(days: list[date]) -> list[tuple[date, date]]:
    if not days:
        return []
    days = sorted(days)
    ranges: list[tuple[date, date]] = []
    run_start = days[0]
    prev = days[0]
    for d in days[1:]:
        # пропускаем разрыв через выходные тоже — между пт и пн нет торговых дней,
        # значит они «подряд» в терминах торгового календаря.
        next_trading = _next_trading_day(prev)
        if d == next_trading:
            prev = d
            continue
        ranges.append((run_start, prev))
        run_start = d
        prev = d
    ranges.append((run_start, prev))
    return ranges


def _next_trading_day(d: date) -> date:
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5:
        nxt += timedelta(days=1)
    return nxt


def _has_data_for_day(ticker: str, day: date) -> bool:
    path = candle_path(ticker, day)
    try:
        return path.exists() and path.stat().st_size > 0
    except OSError:
        return False


def find_missing_ranges(
    ticker: str,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[GapRange]:
    """Список пропущенных диапазонов в локальном хранилище свечей.

    Возвращает диапазоны, которые надо запросить у T-Invest, чтобы покрыть
    период [start, end] минутными свечами.
    """
    ticker = ticker.upper()
    today = date.today()
    start = start or date(settings.CANDLES_HISTORY_START_YEAR, 1, 1)
    end = end or today
    if start > end:
        return []

    trading = list(_iter_trading_days(start, end))
    missing_days = [d for d in trading if not _has_data_for_day(ticker, d)]
    grouped = _group_consecutive_days(missing_days)
    ranges = [GapRange(a, b, "missing_days") for a, b in grouped]

    last_dt = last_saved_candle_dt(ticker)
    if last_dt is not None and end >= today and today.weekday() < 5:
        last_day = last_dt.date()
        # хвост от last_day до today (включительно)
        if last_day <= today:
            tail = GapRange(last_day, today, "tail")
            # дедуп если today уже в missing_days
            ranges = [r for r in ranges if not (r.from_date <= tail.till_date and r.till_date >= tail.from_date)]
            ranges.append(tail)

    ranges.sort(key=lambda r: r.from_date)
    return ranges
```

- [ ] **Step 4: Прогнать все тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_candles_gaps -v 2`
Expected: все 5+ тестов PASS.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/candles_gaps.py django_base/instruments/tests/test_candles_gaps.py
git commit -m "feat(instruments): find_missing_ranges по торговому календарю"
```

---

## Phase 2: Унифицированная Celery-задача

### Task 4: `sync_candles_for_instrument` — happy path

**Files:**
- Modify: `django_base/instruments/tasks.py`
- Create: `django_base/instruments/tests/test_sync_task.py`

- [ ] **Step 1: Написать падающий тест happy-path с моком T-Invest**

```python
# django_base/instruments/tests/test_sync_task.py
from datetime import date
from unittest.mock import patch, MagicMock

from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TestCase, override_settings


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class SyncCandlesTaskHappyPathTests(TestCase):
    def test_happy_path_sends_progress_and_done(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange

        ranges = [
            GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days"),
            GapRange(date(2026, 5, 5), date(2026, 5, 5), "tail"),
        ]
        fake_candles = [
            {"datetime": "2026-05-04 10:00:00", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 10, "value": 0},
        ]

        events: list[dict] = []
        layer = get_channel_layer()

        async def collect():
            from channels.layers import get_channel_layer
            l = get_channel_layer()
            while True:
                msg = await l.receive("test_collector")
                events.append(msg)

        with patch.object(tasks, "_get_admin_token", return_value="fake-token"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid-xyz"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", return_value=fake_candles), \
             patch("instruments.tasks.save_candles_to_csv", return_value=1):

            # перехватываем group_send → пишем в локальный список
            with patch.object(layer, "group_send") as group_send:
                group_send.side_effect = lambda group, event: events.append(event) or _AsyncNoop()
                # вызываем как обычную функцию (bind=True, передаём self заглушку)
                self_mock = MagicMock()
                self_mock.request.id = "task-abc"
                tasks.sync_candles_for_instrument(
                    self_mock,
                    ticker="SBER",
                    market="stock",
                    api_ticker=None,
                )

        # проверяем поток событий
        types = [e["type"] for e in events]
        self.assertEqual(types.count("sync.progress"), 2)
        self.assertEqual(types[-1], "sync.done")
        done = events[-1]
        self.assertEqual(done["task_id"], "task-abc")
        self.assertEqual(done["total_ranges"], 2)
        self.assertEqual(done["errors"], 0)
        self.assertEqual(done["cumulative_candles"], 2)  # 1 свеча × 2 range
```

(helper:)

```python
class _AsyncNoop:
    def __await__(self):
        if False:
            yield
        return None
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_sync_task.SyncCandlesTaskHappyPathTests -v 2`
Expected: AttributeError (нет `sync_candles_for_instrument`) либо ImportError для `find_missing_ranges` из tasks.

- [ ] **Step 3: Реализовать минимальную `sync_candles_for_instrument`**

В `instruments/tasks.py` добавить новую задачу (старые **пока** не трогаем):

```python
from datetime import datetime
from celery.exceptions import SoftTimeLimitExceeded
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def _publish(layer, group, event):
    async_to_sync(layer.group_send)(group, event)


def _state_key(ticker: str) -> str:
    return f"candles:sync_state:{ticker.upper()}"


def _lock_key(ticker: str) -> str:
    return f"candles:sync_lock:{ticker.upper()}"


def _release_lock(ticker: str) -> None:
    cache.delete(_lock_key(ticker))
    cache.delete(_state_key(ticker))


@shared_task(bind=True, time_limit=7200, soft_time_limit=7000)
def sync_candles_for_instrument(
    self,
    ticker: str,
    *,
    market: str = "stock",
    api_ticker: str | None = None,
    start: str | None = None,
    end: str | None = None,
    triggered_by: int | None = None,
):
    """Унифицированная задача догрузки свечей одного инструмента.

    Шлёт прогресс в Channels group ``candles_sync_{ticker}``.
    """
    from instruments.candles import save_candles_to_csv
    from instruments.candles_gaps import find_missing_ranges
    from instruments.tinkoff_candles import fetch_tinkoff_candles, resolve_instrument_uid

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
```

- [ ] **Step 4: Прогнать тест**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_sync_task.SyncCandlesTaskHappyPathTests -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/tasks.py django_base/instruments/tests/test_sync_task.py
git commit -m "feat(instruments): задача sync_candles_for_instrument с прогрессом в Channels"
```

---

### Task 5: `sync_candles_for_instrument` — error paths

**Files:**
- Modify: `django_base/instruments/tests/test_sync_task.py`
- (без правок в `tasks.py`, поведение уже реализовано — добавляем покрытие)

- [ ] **Step 1: Написать падающие тесты для no_token / uid_not_found / exception в range / timeout**

Добавить в файл:

```python
@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class SyncCandlesTaskErrorPathsTests(TestCase):
    def _run(self, **overrides):
        from instruments import tasks
        from channels.layers import get_channel_layer
        events: list[dict] = []
        layer = get_channel_layer()
        with patch.object(layer, "group_send") as group_send:
            group_send.side_effect = lambda g, e: events.append(e) or _AsyncNoop()
            self_mock = MagicMock()
            self_mock.request.id = "task-err"
            tasks.sync_candles_for_instrument(self_mock, ticker="SBER", market="stock", **overrides)
        return events

    def test_no_token(self):
        from instruments import tasks
        with patch.object(tasks, "_get_admin_token", return_value=None):
            events = self._run()
        self.assertEqual(events[0]["type"], "sync.error")
        self.assertEqual(events[0]["message"], "no_token")

    def test_uid_not_found(self):
        from instruments import tasks
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value=None):
            events = self._run()
        self.assertEqual(events[0]["type"], "sync.error")
        self.assertEqual(events[0]["message"], "uid_not_found")

    def test_exception_in_one_range_continues(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange
        ranges = [
            GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days"),
            GapRange(date(2026, 5, 5), date(2026, 5, 5), "missing_days"),
        ]
        def fetch_side_effect(token, uid, frm, till, interval):
            if frm == date(2026, 5, 4):
                raise RuntimeError("boom")
            return [{"datetime": "2026-05-05 10:00:00", "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1, "value": 0}]
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", side_effect=fetch_side_effect), \
             patch("instruments.tasks.save_candles_to_csv", return_value=1):
            events = self._run()
        done = [e for e in events if e["type"] == "sync.done"][0]
        self.assertEqual(done["errors"], 1)
        self.assertEqual(done["total_ranges"], 2)

    def test_soft_timeout_emits_error(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange
        from celery.exceptions import SoftTimeLimitExceeded
        ranges = [GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days")]
        def boom(*a, **kw):
            raise SoftTimeLimitExceeded()
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", side_effect=boom):
            events = self._run()
        self.assertEqual(events[-1]["type"], "sync.error")
        self.assertEqual(events[-1]["message"], "timeout")
```

- [ ] **Step 2: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_sync_task -v 2`
Expected: все тесты PASS (включая happy-path из Task 4).

- [ ] **Step 3: Если test_exception_in_one_range_continues падает** — проверить, что `except Exception` в реализации обёрнут вокруг range loop и не ловит `SoftTimeLimitExceeded`. Поправить порядок exception handlers — `SoftTimeLimitExceeded` ловится во **внешнем** try.

- [ ] **Step 4: Commit**

```bash
git add django_base/instruments/tests/test_sync_task.py
git commit -m "test(instruments): покрытие error-веток sync_candles_for_instrument"
```

---

### Task 6: Обёртки старых задач

**Files:**
- Modify: `django_base/instruments/tasks.py`
- Create: `django_base/instruments/tests/test_legacy_wrappers.py`

- [ ] **Step 1: Написать падающий тест на обёртку `load_candles_for_instrument`**

```python
# django_base/instruments/tests/test_legacy_wrappers.py
from datetime import date
from unittest.mock import patch, MagicMock

from django.test import TestCase


class LoadCandlesForInstrumentWrapperTests(TestCase):
    def test_year_translates_to_start_end_range(self):
        from instruments import tasks
        with patch.object(tasks, "sync_candles_for_instrument") as sync_mock:
            sync_mock.return_value = {"ticker": "SBER"}
            self_mock = MagicMock()
            tasks.load_candles_for_instrument(self_mock, "SBER", year=2025, market="stock")
        kwargs = sync_mock.call_args.kwargs
        self.assertEqual(kwargs["start"], "2025-01-01")
        self.assertEqual(kwargs["end"], "2025-12-31")
        self.assertEqual(kwargs["market"], "stock")

    def test_default_year_is_current(self):
        from instruments import tasks
        with patch.object(tasks, "sync_candles_for_instrument") as sync_mock:
            sync_mock.return_value = {"ticker": "SBER"}
            self_mock = MagicMock()
            tasks.load_candles_for_instrument(self_mock, "SBER")
        kwargs = sync_mock.call_args.kwargs
        self.assertTrue(kwargs["start"].startswith(str(date.today().year)))


class UpdateTodayCandlesWrapperTests(TestCase):
    def test_fan_out_for_active_stocks(self):
        from instruments import tasks
        from instruments.models import Instrument, Futures
        # Минимум — создать пару тикеров. Без миграций моделей не обойтись,
        # поэтому используем bulk_create в обычной БД теста.
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)
        Futures.objects.create(ticker="SiU5", name="Si", secid="SiU5", is_active=True)

        with patch.object(tasks.sync_candles_for_instrument, "apply_async") as apply_mock:
            self_mock = MagicMock()
            tasks.update_today_candles(self_mock)
        called_tickers = sorted([c.kwargs["kwargs"]["ticker"] for c in apply_mock.call_args_list])
        self.assertIn("SBER", called_tickers)
        self.assertIn("SIU5", called_tickers)
        # start/end = today
        today_iso = date.today().isoformat()
        for c in apply_mock.call_args_list:
            self.assertEqual(c.kwargs["kwargs"]["start"], today_iso)
            self.assertEqual(c.kwargs["kwargs"]["end"], today_iso)
```

- [ ] **Step 2: Прогнать — должны упасть (`sync` не вызывается из обёрток)**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_legacy_wrappers -v 2`
Expected: FAIL (старые реализации напрямую дёргают T-Invest, sync_mock не вызывается).

- [ ] **Step 3: Заменить тела `load_candles_for_instrument` и `update_today_candles`**

```python
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
    return sync_candles_for_instrument(
        self,
        ticker=ticker,
        market=market,
        api_ticker=api_ticker,
        start=start.isoformat(),
        end=end.isoformat(),
    )


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
```

Удалить старую константу `_MONTH_COMPLETE_THRESHOLD` (больше не используется).

- [ ] **Step 4: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests -v 2`
Expected: все PASS, ни один регрессионный тест не упал.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/tasks.py django_base/instruments/tests/test_legacy_wrappers.py
git commit -m "refactor(instruments): legacy задачи как обёртки над sync_candles_for_instrument"
```

---

## Phase 3: WebSocket-инфраструктура

### Task 7: JWT middleware для Channels

**Files:**
- Create: `django_base/accounts/channels_auth.py`
- Create: `django_base/accounts/tests/__init__.py` (если ещё нет)
- Create: `django_base/accounts/tests/test_channels_auth.py`
- (если `accounts/tests.py` существует — превратить в пакет аналогично Task 0)

- [ ] **Step 1: Проверить структуру `accounts/tests`**

Run: `ls django_base/accounts/ | grep tests`
- Если есть `tests.py` — `rm` и `mkdir tests/ + __init__.py`.
- Если уже пакет — пропустить.

- [ ] **Step 2: Написать падающий тест на middleware**

```python
# django_base/accounts/tests/test_channels_auth.py
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework_simplejwt.tokens import AccessToken


class JWTAuthMiddlewareTests(TestCase):
    def test_valid_token_sets_user(self):
        from accounts.channels_auth import JWTAuthMiddleware
        User = get_user_model()
        user = User.objects.create_user(username="alice", password="x")
        token = str(AccessToken.for_user(user))

        scope = {"type": "websocket", "query_string": f"token={token}".encode()}
        captured = {}

        async def inner(scope, receive, send):
            captured["user"] = scope["user"]

        import asyncio
        asyncio.get_event_loop().run_until_complete(
            JWTAuthMiddleware(inner)(scope, None, None)
        )
        self.assertEqual(captured["user"].id, user.id)

    def test_missing_token_sets_anonymous(self):
        from accounts.channels_auth import JWTAuthMiddleware
        from django.contrib.auth.models import AnonymousUser

        scope = {"type": "websocket", "query_string": b""}
        captured = {}

        async def inner(scope, receive, send):
            captured["user"] = scope["user"]

        import asyncio
        asyncio.get_event_loop().run_until_complete(
            JWTAuthMiddleware(inner)(scope, None, None)
        )
        self.assertIsInstance(captured["user"], AnonymousUser)

    def test_invalid_token_sets_anonymous(self):
        from accounts.channels_auth import JWTAuthMiddleware
        from django.contrib.auth.models import AnonymousUser

        scope = {"type": "websocket", "query_string": b"token=not-a-jwt"}
        captured = {}

        async def inner(scope, receive, send):
            captured["user"] = scope["user"]

        import asyncio
        asyncio.get_event_loop().run_until_complete(
            JWTAuthMiddleware(inner)(scope, None, None)
        )
        self.assertIsInstance(captured["user"], AnonymousUser)
```

- [ ] **Step 3: Запустить — должен упасть**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test accounts.tests.test_channels_auth -v 2`
Expected: ImportError.

- [ ] **Step 4: Реализовать middleware**

```python
# django_base/accounts/channels_auth.py
"""Channels middleware: аутентификация WebSocket-соединений через JWT в query."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _user_from_token(token: str):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        validated = AccessToken(token)
        user_id = validated.get("user_id")
        if user_id is None:
            return AnonymousUser()
        User = get_user_model()
        return User.objects.get(pk=user_id)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Достаёт `?token=<jwt>` из query string и кладёт ``scope['user']``."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = None
        qs = scope.get("query_string", b"").decode()
        if qs:
            params = parse_qs(qs)
            token = params.get("token", [None])[0]
        scope["user"] = await _user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)
```

- [ ] **Step 5: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test accounts.tests.test_channels_auth -v 2`
Expected: 3 теста PASS.

- [ ] **Step 6: Commit**

```bash
git add django_base/accounts/channels_auth.py django_base/accounts/tests/
git commit -m "feat(accounts): JWTAuthMiddleware для аутентификации WebSocket"
```

---

### Task 8: `CandleSyncConsumer`

**Files:**
- Create: `django_base/instruments/consumers.py`
- Create: `django_base/instruments/tests/test_consumers.py`

- [ ] **Step 1: Написать падающий тест на consumer**

```python
# django_base/instruments/tests/test_consumers.py
import json
from datetime import date

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings


def _build_app():
    """Собирает asgi-app только из WS-роутера + JWT middleware для теста."""
    from channels.routing import URLRouter
    from django.urls import re_path
    from instruments.consumers import CandleSyncConsumer
    from accounts.channels_auth import JWTAuthMiddleware

    return JWTAuthMiddleware(URLRouter([
        re_path(r"ws/candles-sync/(?P<ticker>[A-Z0-9._-]+)/$", CandleSyncConsumer.as_asgi()),
    ]))


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class CandleSyncConsumerTests(TransactionTestCase):
    async def _connect(self, ticker, token=""):
        app = _build_app()
        comm = WebsocketCommunicator(app, f"/ws/candles-sync/{ticker}/?token={token}")
        return comm, await comm.connect()

    def test_anonymous_closed_4403(self):
        from instruments.models import Instrument
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)
        import asyncio
        comm, (connected, code) = asyncio.get_event_loop().run_until_complete(self._connect("SBER"))
        self.assertFalse(connected)
        self.assertEqual(code, 4403)

    def test_non_staff_closed_4403(self):
        from instruments.models import Instrument
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)
        from rest_framework_simplejwt.tokens import AccessToken
        User = get_user_model()
        u = User.objects.create_user(username="alice", password="x", is_staff=False)
        token = str(AccessToken.for_user(u))
        import asyncio
        comm, (connected, code) = asyncio.get_event_loop().run_until_complete(self._connect("SBER", token))
        self.assertFalse(connected)
        self.assertEqual(code, 4403)

    def test_unknown_ticker_closed_4404(self):
        from rest_framework_simplejwt.tokens import AccessToken
        User = get_user_model()
        admin = User.objects.create_user(username="root", password="x", is_staff=True)
        token = str(AccessToken.for_user(admin))
        import asyncio
        comm, (connected, code) = asyncio.get_event_loop().run_until_complete(self._connect("ZZZZ", token))
        self.assertFalse(connected)
        self.assertEqual(code, 4404)

    def test_admin_connects_and_receives_progress(self):
        from instruments.models import Instrument
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)
        from rest_framework_simplejwt.tokens import AccessToken
        User = get_user_model()
        admin = User.objects.create_user(username="root", password="x", is_staff=True)
        token = str(AccessToken.for_user(admin))

        import asyncio
        loop = asyncio.get_event_loop()
        comm, (connected, _subprotocol) = loop.run_until_complete(self._connect("SBER", token))
        self.assertTrue(connected)

        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        loop.run_until_complete(layer.group_send("candles_sync_SBER", {
            "type": "sync.progress",
            "task_id": "t1",
            "done_ranges": 1, "total_ranges": 2,
            "range_from": "2026-05-04", "range_till": "2026-05-04",
            "range_candles": 5, "cumulative_candles": 5,
        }))
        received = loop.run_until_complete(comm.receive_json_from())
        self.assertEqual(received["type"], "sync.progress")
        self.assertEqual(received["task_id"], "t1")
        loop.run_until_complete(comm.disconnect())
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_consumers -v 2`
Expected: ImportError для `instruments.consumers`.

- [ ] **Step 3: Реализовать consumer**

```python
# django_base/instruments/consumers.py
"""WebSocket consumer для прогресса синхронизации свечей."""
from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from django.core.cache import cache


def _ticker_exists(ticker: str) -> bool:
    from instruments.models import Futures, Instrument
    return (
        Instrument.objects.filter(ticker=ticker, is_active=True).exists()
        or Futures.objects.filter(ticker=ticker, is_active=True).exists()
    )


class CandleSyncConsumer(JsonWebsocketConsumer):
    def connect(self):
        user = self.scope.get("user")
        if not getattr(user, "is_authenticated", False) or not getattr(user, "is_staff", False):
            self.close(code=4403)
            return

        self.ticker = self.scope["url_route"]["kwargs"]["ticker"].upper()
        if not _ticker_exists(self.ticker):
            self.close(code=4404)
            return

        self.group = f"candles_sync_{self.ticker}"
        async_to_sync(self.channel_layer.group_add)(self.group, self.channel_name)
        self.accept()

        state = cache.get(f"candles:sync_state:{self.ticker}")
        if state:
            snapshot = dict(state)
            snapshot["type"] = "sync.snapshot"
            self.send_json(snapshot)

    def disconnect(self, code):
        group = getattr(self, "group", None)
        if group:
            async_to_sync(self.channel_layer.group_discard)(group, self.channel_name)

    def sync_progress(self, event): self.send_json(event)
    def sync_done(self, event):     self.send_json(event)
    def sync_error(self, event):    self.send_json(event)
    def sync_snapshot(self, event): self.send_json(event)
```

- [ ] **Step 4: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_consumers -v 2`
Expected: все 4 теста PASS.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/consumers.py django_base/instruments/tests/test_consumers.py
git commit -m "feat(instruments): CandleSyncConsumer с проверкой is_staff и snapshot"
```

---

### Task 9: Routing + ASGI application

**Files:**
- Create: `django_base/django_base/routing.py`
- Modify: `django_base/django_base/asgi.py`

- [ ] **Step 1: Создать `routing.py`**

```python
# django_base/django_base/routing.py
from channels.routing import URLRouter
from django.urls import re_path

from instruments.consumers import CandleSyncConsumer

websocket_urlpatterns = [
    re_path(r"ws/candles-sync/(?P<ticker>[A-Z0-9._-]+)/$", CandleSyncConsumer.as_asgi()),
]
```

- [ ] **Step 2: Переписать `asgi.py`**

```python
# django_base/django_base/asgi.py
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_base.settings')

# Django ASGI app должен быть инициализирован до импорта чего-либо, что
# использует ORM (consumers/middleware).
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from accounts.channels_auth import JWTAuthMiddleware  # noqa: E402
from django_base.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns))
    ),
})
```

- [ ] **Step 3: Поднять контейнеры с новым asgi**

Run: `docker compose -f docker-compose.dev.yml restart web`
Затем: `docker compose -f docker-compose.dev.yml logs --tail=50 web`
Expected: uvicorn запустился без traceback.

- [ ] **Step 4: Прогнать все тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test`
Expected: всё PASS.

- [ ] **Step 5: Commit**

```bash
git add django_base/django_base/routing.py django_base/django_base/asgi.py
git commit -m "feat(infra): подключить websocket routing к ASGI"
```

---

## Phase 4: REST endpoints

### Task 10: `AdminCandleSyncView` (POST)

**Files:**
- Modify: `django_base/instruments/views.py`
- Modify: `django_base/instruments/urls.py`
- Create: `django_base/instruments/tests/test_admin_candle_sync_view.py`

- [ ] **Step 1: Написать падающие тесты**

```python
# django_base/instruments/tests/test_admin_candle_sync_view.py
from datetime import date
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.test import TestCase

from instruments.models import Instrument


class AdminCandleSyncViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username="root", password="x", is_staff=True)
        self.user = User.objects.create_user(username="u", password="x", is_staff=False)
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_403_when_not_staff(self):
        resp = self._client(self.user).post("/api/instruments/SBER/sync-candles/", {})
        self.assertEqual(resp.status_code, 403)

    def test_404_unknown_ticker(self):
        resp = self._client(self.admin).post("/api/instruments/ZZZZ/sync-candles/", {})
        self.assertEqual(resp.status_code, 404)

    def test_202_starts_task_and_takes_lock(self):
        with patch("instruments.views.sync_candles_for_instrument") as task_mock:
            task_mock.apply_async.return_value = MagicMock(id="task-1")
            resp = self._client(self.admin).post("/api/instruments/SBER/sync-candles/", {})
        self.assertEqual(resp.status_code, 202)
        self.assertEqual(resp.json()["task_id"], "task-1")
        self.assertEqual(resp.json()["ticker"], "SBER")
        task_mock.apply_async.assert_called_once()

    def test_409_when_lock_busy(self):
        from django.core.cache import cache
        cache.set("candles:sync_lock:SBER", "task-old", 60)
        cache.set("candles:sync_state:SBER", {"task_id": "task-old"}, 60)
        try:
            resp = self._client(self.admin).post("/api/instruments/SBER/sync-candles/", {})
        finally:
            cache.delete("candles:sync_lock:SBER")
            cache.delete("candles:sync_state:SBER")
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()["task_id"], "task-old")
```

- [ ] **Step 2: Запустить — должен упасть (404 на /sync-candles/)**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_admin_candle_sync_view -v 2`
Expected: FAIL — endpoint не зарегистрирован.

- [ ] **Step 3: Реализовать view**

В `instruments/views.py` добавить (импорт сверху):

```python
from rest_framework.permissions import IsAdminUser
from django.core.cache import cache

from instruments.tasks import sync_candles_for_instrument


def _resolve_market(ticker: str):
    """Возвращает (market, api_ticker) либо (None, None) если тикер не найден."""
    inst = Instrument.objects.filter(ticker=ticker, is_active=True).first()
    if inst:
        return "stock", inst.ticker
    fut = Futures.objects.filter(ticker=ticker, is_active=True).first()
    if fut and fut.secid:
        return "futures", fut.secid
    return None, None


class AdminCandleSyncView(APIView):
    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, ticker):
        ticker = ticker.upper()
        market, api_ticker = _resolve_market(ticker)
        if not market:
            return Response({"detail": "Инструмент не найден."}, status=status.HTTP_404_NOT_FOUND)

        lock_key = f"candles:sync_lock:{ticker}"
        state_key = f"candles:sync_state:{ticker}"
        try:
            redis_client = cache.client.get_client()
        except Exception:
            return Response({"detail": "Кэш недоступен."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        ttl = getattr(settings, "CANDLES_SYNC_LOCK_TTL", 21600)
        acquired = redis_client.set(lock_key, "pending", nx=True, ex=ttl)
        if not acquired:
            existing = cache.get(state_key) or {}
            return Response(
                {"detail": "Синхронизация уже идёт.", "task_id": existing.get("task_id")},
                status=status.HTTP_409_CONFLICT,
            )

        start = request.data.get("start")
        end = request.data.get("end")

        task = sync_candles_for_instrument.apply_async(kwargs={
            "ticker": ticker,
            "market": market,
            "api_ticker": api_ticker,
            "start": start,
            "end": end,
            "triggered_by": request.user.id,
        })
        redis_client.set(lock_key, task.id, ex=ttl)
        return Response({"task_id": task.id, "ticker": ticker}, status=status.HTTP_202_ACCEPTED)
```

И импорт `from django.conf import settings`, если ещё нет в файле.

- [ ] **Step 4: Подключить URL**

В `instruments/urls.py` добавить **до** `<str:ticker>/`:

```python
path('<str:ticker>/sync-candles/', views.AdminCandleSyncView.as_view(), name='admin_candle_sync'),
```

(порядок важен: ловит `SBER/sync-candles/` раньше, чем общий `<str:ticker>/`.)

- [ ] **Step 5: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_admin_candle_sync_view -v 2`
Expected: 4 теста PASS.

- [ ] **Step 6: Commit**

```bash
git add django_base/instruments/views.py django_base/instruments/urls.py django_base/instruments/tests/test_admin_candle_sync_view.py
git commit -m "feat(instruments): эндпоинт POST sync-candles c lock и task dispatch"
```

---

### Task 11: `AdminCandleSyncStateView` (GET)

**Files:**
- Modify: `django_base/instruments/views.py`
- Modify: `django_base/instruments/urls.py`
- Modify: `django_base/instruments/tests/test_admin_candle_sync_view.py`

- [ ] **Step 1: Тест на GET state**

Добавить:

```python
class AdminCandleSyncStateViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username="root", password="x", is_staff=True)
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True)
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.admin)

    def test_returns_null_when_no_state(self):
        resp = self.client_.get("/api/instruments/SBER/sync-candles/state/")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json())

    def test_returns_state(self):
        from django.core.cache import cache
        cache.set("candles:sync_state:SBER", {
            "task_id": "t1", "done_ranges": 1, "total_ranges": 2,
            "range_from": "2026-05-04", "range_till": "2026-05-04",
            "range_candles": 5, "cumulative_candles": 5,
        }, 60)
        try:
            resp = self.client_.get("/api/instruments/SBER/sync-candles/state/")
        finally:
            cache.delete("candles:sync_state:SBER")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["task_id"], "t1")
```

- [ ] **Step 2: Запустить — должен упасть (404)**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_admin_candle_sync_view.AdminCandleSyncStateViewTests -v 2`
Expected: FAIL.

- [ ] **Step 3: Реализовать view + URL**

`views.py`:

```python
class AdminCandleSyncStateView(APIView):
    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request, ticker):
        ticker = ticker.upper()
        state = cache.get(f"candles:sync_state:{ticker}")
        return Response(state)  # None → null в JSON
```

`urls.py`:

```python
path('<str:ticker>/sync-candles/state/', views.AdminCandleSyncStateView.as_view(), name='admin_candle_sync_state'),
```

(этот путь длиннее предыдущего — добавить **до** `<str:ticker>/sync-candles/`.)

- [ ] **Step 4: Прогнать тесты**

Run: `docker compose -f docker-compose.dev.yml exec web python manage.py test instruments.tests.test_admin_candle_sync_view -v 2`
Expected: все PASS.

- [ ] **Step 5: Commit**

```bash
git add django_base/instruments/views.py django_base/instruments/urls.py django_base/instruments/tests/test_admin_candle_sync_view.py
git commit -m "feat(instruments): GET sync-candles/state/ для polling fallback"
```

---

## Phase 5: Frontend — API + WS hook

### Task 12: Vite proxy для `/ws`

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Добавить proxy**

```ts
// frontend/vite.config.ts — в блок proxy: добавить
'/ws': { target: django.replace('http', 'ws'), ws: true, changeOrigin: true },
```

(или явно: `target: 'ws://web:8000', ws: true`. Лучше через тот же `django` env var.)

- [ ] **Step 2: Перезапустить frontend контейнер**

Run: `docker compose -f docker-compose.dev.yml restart frontend`
Затем: `docker compose -f docker-compose.dev.yml logs --tail=30 frontend`
Expected: vite старт без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "chore(frontend): vite proxy для /ws на Django ASGI"
```

---

### Task 13: API типы и client

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/endpoints.ts`

- [ ] **Step 1: Добавить типы в `types.ts`**

```ts
// frontend/src/api/types.ts (добавить в конец)
export type CandleSyncSnapshot = {
  task_id: string;
  done_ranges: number;
  total_ranges: number;
  range_from: string;
  range_till: string;
  range_candles?: number;
  cumulative_candles: number;
};

export type CandleSyncEvent =
  | ({ type: 'sync.snapshot' | 'sync.progress' } & CandleSyncSnapshot)
  | { type: 'sync.done'; task_id: string; total_ranges: number; cumulative_candles: number; duration_s: number; errors: number }
  | { type: 'sync.error'; task_id: string; message: string };

export type CandleSyncStartResponse = { task_id: string; ticker: string };
```

- [ ] **Step 2: Добавить группу endpoints**

```ts
// frontend/src/api/endpoints.ts (добавить рядом с instrumentsApi)
import type { CandleSyncSnapshot, CandleSyncStartResponse } from './types';

export const adminCandleSync = {
  start: (ticker: string, body?: { start?: string; end?: string }) =>
    api.post<CandleSyncStartResponse>(
      `/instruments/${ticker}/sync-candles/`,
      body ?? {},
    ),
  state: (ticker: string) =>
    api.get<CandleSyncSnapshot | null>(`/instruments/${ticker}/sync-candles/state/`),
};
```

- [ ] **Step 3: Проверить type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/endpoints.ts
git commit -m "feat(frontend): API типы и клиент для adminCandleSync"
```

---

### Task 14: `useCandleSyncSocket` хук

**Files:**
- Create: `frontend/src/lib/useCandleSyncSocket.ts`
- Create: `frontend/src/lib/__tests__/useCandleSyncSocket.test.ts`

- [ ] **Step 1: Тест на инициализацию и `progress`**

```ts
// frontend/src/lib/__tests__/useCandleSyncSocket.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCandleSyncSocket } from '../useCandleSyncSocket';

class MockWS {
  static instances: MockWS[] = [];
  url: string;
  readyState = 0;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;
  onerror?: () => void;
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });
  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  emit(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

vi.mock('@/api/endpoints', () => ({
  adminCandleSync: {
    state: vi.fn(async () => null),
  },
}));

beforeEach(() => {
  MockWS.instances = [];
  // @ts-expect-error mock
  globalThis.WebSocket = MockWS;
  localStorage.setItem('td_access', 'fake-token');
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useCandleSyncSocket', () => {
  it('opens WS with token query when enabled', async () => {
    renderHook(() => useCandleSyncSocket('SBER', { enabled: true }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    expect(MockWS.instances[0].url).toContain('/ws/candles-sync/SBER/');
    expect(MockWS.instances[0].url).toContain('token=fake-token');
  });

  it('updates state to running on progress event', async () => {
    const { result } = renderHook(() => useCandleSyncSocket('SBER', { enabled: true }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    act(() => {
      MockWS.instances[0].emit({
        type: 'sync.progress',
        task_id: 't1', done_ranges: 1, total_ranges: 3,
        range_from: '2026-05-04', range_till: '2026-05-04',
        range_candles: 5, cumulative_candles: 5,
      });
    });
    await waitFor(() => expect(result.current.state).toBe('running'));
    expect(result.current.last?.type).toBe('sync.progress');
  });

  it('switches to done on sync.done', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useCandleSyncSocket('SBER', { enabled: true, onDone }));
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    act(() => {
      MockWS.instances[0].emit({
        type: 'sync.done', task_id: 't1', total_ranges: 1,
        cumulative_candles: 5, duration_s: 1.2, errors: 0,
      });
    });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('does not open WS when enabled=false', async () => {
    renderHook(() => useCandleSyncSocket('SBER', { enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(MockWS.instances.length).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `cd frontend && npm test -- --run useCandleSyncSocket`
Expected: FAIL (модуля нет).

- [ ] **Step 3: Реализовать хук**

```ts
// frontend/src/lib/useCandleSyncSocket.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminCandleSync } from '@/api/endpoints';
import { tokenStore } from '@/api/client';
import type { CandleSyncEvent } from '@/api/types';

type State = 'idle' | 'running' | 'done' | 'error';

export interface UseCandleSyncSocketOptions {
  enabled: boolean;
  onProgress?: (e: CandleSyncEvent) => void;
  onDone?: (e: CandleSyncEvent) => void;
  onError?: (e: CandleSyncEvent) => void;
}

const BACKOFF_MS = [1000, 2000, 5000, 10000];

function buildWsUrl(ticker: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  return `${proto}://${host}/ws/candles-sync/${encodeURIComponent(ticker)}/?token=${encodeURIComponent(token)}`;
}

export function useCandleSyncSocket(
  ticker: string | null,
  opts: UseCandleSyncSocketOptions,
): { state: State; last: CandleSyncEvent | null } {
  const [state, setState] = useState<State>('idle');
  const [last, setLast] = useState<CandleSyncEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);

  const dispatch = useCallback((evt: CandleSyncEvent) => {
    setLast(evt);
    switch (evt.type) {
      case 'sync.snapshot':
      case 'sync.progress':
        setState('running');
        opts.onProgress?.(evt);
        break;
      case 'sync.done':
        setState('done');
        opts.onDone?.(evt);
        break;
      case 'sync.error':
        setState('error');
        opts.onError?.(evt);
        break;
    }
  }, [opts]);

  useEffect(() => {
    aliveRef.current = true;
    if (!opts.enabled || !ticker) return;

    // bootstrap текущего state
    adminCandleSync.state(ticker).then((snap) => {
      if (aliveRef.current && snap) {
        dispatch({ ...(snap as any), type: 'sync.snapshot' });
      }
    }).catch(() => { /* noop — фолбэк на WS */ });

    function connect() {
      const token = tokenStore.access ?? '';
      const ws = new WebSocket(buildWsUrl(ticker!, token));
      wsRef.current = ws;
      ws.onopen = () => { attemptRef.current = 0; };
      ws.onmessage = (e) => {
        try { dispatch(JSON.parse(e.data) as CandleSyncEvent); } catch { /* ignore */ }
      };
      ws.onclose = (e) => {
        if (!aliveRef.current) return;
        if (e.code === 4403 || e.code === 4404) {
          setState('error');
          return;
        }
        // только если задача всё ещё running — реконнект
        if (state !== 'running') return;
        const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
        attemptRef.current += 1;
        setTimeout(() => { if (aliveRef.current) connect(); }, delay);
      };
      ws.onerror = () => { /* close обработает */ };
    }
    connect();

    return () => {
      aliveRef.current = false;
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, opts.enabled]);

  return { state, last };
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd frontend && npm test -- --run useCandleSyncSocket`
Expected: 4 теста PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useCandleSyncSocket.ts frontend/src/lib/__tests__/useCandleSyncSocket.test.ts
git commit -m "feat(frontend): useCandleSyncSocket — WebSocket подписка на прогресс"
```

---

## Phase 6: Frontend — кнопка и интеграция в график

### Task 15: `AdminCandleSyncButton`

**Files:**
- Create: `frontend/src/components/AdminCandleSyncButton.tsx`
- Create: `frontend/src/components/__tests__/AdminCandleSyncButton.test.tsx`

- [ ] **Step 1: Тест на 4 состояния и клик**

```tsx
// frontend/src/components/__tests__/AdminCandleSyncButton.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/endpoints', () => ({
  adminCandleSync: {
    start: vi.fn(async () => ({ task_id: 't1', ticker: 'SBER' })),
    state: vi.fn(async () => null),
  },
}));

let mockState: 'idle' | 'running' | 'done' | 'error' = 'idle';
let mockLast: any = null;
vi.mock('@/lib/useCandleSyncSocket', () => ({
  useCandleSyncSocket: () => ({ state: mockState, last: mockLast }),
}));

import AdminCandleSyncButton from '../AdminCandleSyncButton';
import { adminCandleSync } from '@/api/endpoints';

beforeEach(() => {
  mockState = 'idle';
  mockLast = null;
  vi.clearAllMocks();
});

describe('AdminCandleSyncButton', () => {
  it('idle: renders button with title', () => {
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    expect(screen.getByRole('button', { name: /догрузить/i })).toBeEnabled();
  });

  it('click triggers start()', async () => {
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    await userEvent.click(screen.getByRole('button'));
    expect(adminCandleSync.start).toHaveBeenCalledWith('SBER', {});
  });

  it('running: shows progress fraction', () => {
    mockState = 'running';
    mockLast = {
      type: 'sync.progress',
      task_id: 't1', done_ranges: 2, total_ranges: 5,
      range_from: '2026-05-04', range_till: '2026-05-04',
      range_candles: 10, cumulative_candles: 25,
    };
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    expect(screen.getByText(/2.*5/)).toBeInTheDocument();
  });

  it('error: shows error indicator', () => {
    mockState = 'error';
    mockLast = { type: 'sync.error', task_id: 't1', message: 'no_token' };
    render(<AdminCandleSyncButton ticker="SBER" market="stock" />);
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'error');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `cd frontend && npm test -- --run AdminCandleSyncButton`
Expected: FAIL.

- [ ] **Step 3: Реализовать компонент**

```tsx
// frontend/src/components/AdminCandleSyncButton.tsx
import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { adminCandleSync } from '@/api/endpoints';
import { useCandleSyncSocket } from '@/lib/useCandleSyncSocket';
import { Button } from '@/components/ui/button';
import type { CandleSyncEvent } from '@/api/types';

export interface AdminCandleSyncButtonProps {
  ticker: string;
  market: 'stock' | 'futures';
  onProgress?: (e: CandleSyncEvent) => void;
  onSynced?: (e: CandleSyncEvent) => void;
}

export default function AdminCandleSyncButton(props: AdminCandleSyncButtonProps) {
  const { ticker, onProgress, onSynced } = props;
  const [busy, setBusy] = useState(false);
  const { state, last } = useCandleSyncSocket(ticker, {
    enabled: true,
    onProgress,
    onDone: onSynced,
  });

  async function handleClick() {
    if (state === 'running' || busy) return;
    setBusy(true);
    try {
      await adminCandleSync.start(ticker, {});
    } catch (err) {
      // 409 → state придёт через WS; иные → показывать ошибку из toast (V2)
      console.warn('sync-candles start failed', err);
    } finally {
      setBusy(false);
    }
  }

  const Icon =
    state === 'running' ? Loader2 :
    state === 'done'    ? CheckCircle2 :
    state === 'error'   ? AlertCircle :
    RefreshCw;

  const title =
    state === 'running'
      ? last && 'done_ranges' in last
        ? `${(last as any).done_ranges}/${(last as any).total_ranges}`
        : 'Загрузка...'
      : state === 'done'
      ? 'Готово'
      : state === 'error'
      ? 'Ошибка'
      : 'Догрузить свечи';

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={state === 'running' || busy}
      data-state={state}
      title={title}
      className="gap-2"
    >
      <Icon className={`h-4 w-4 ${state === 'running' ? 'animate-spin' : ''}`} />
      {state === 'running' && last && 'done_ranges' in last && (
        <span className="text-xs tabular-nums">
          {(last as any).done_ranges}/{(last as any).total_ranges}
        </span>
      )}
      {state === 'idle' && <span className="text-xs">Догрузить</span>}
    </Button>
  );
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd frontend && npm test -- --run AdminCandleSyncButton`
Expected: все PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AdminCandleSyncButton.tsx frontend/src/components/__tests__/AdminCandleSyncButton.test.tsx
git commit -m "feat(frontend): AdminCandleSyncButton с состояниями idle/running/done/error"
```

---

### Task 16: Интеграция в `CandlestickChart`

**Files:**
- Modify: `frontend/src/components/CandlestickChart.tsx`
- Modify: `frontend/src/pages/trades/quick/__tests__/QuickTradeEntryPage.test.tsx` (если ломается мок)

- [ ] **Step 1: Найти точку для тулбара**

Run: `grep -n "INTERVALS\|interval.*map\|toolbar" frontend/src/components/CandlestickChart.tsx | head -20`
Из вывода взять номер строки с блоком, где рендерится селектор интервалов — туда добавить кнопку.

- [ ] **Step 2: Достать `useAuth` и определить `market`**

Импорты (добавить в `CandlestickChart.tsx`):

```ts
import { useAuth } from '@/auth/AuthContext';
import AdminCandleSyncButton from './AdminCandleSyncButton';
```

В компонент (после существующих ref'ов):

```ts
const { user } = useAuth();
const isAdmin = !!user?.is_staff;
// Тип рынка можно получить из props или из метаданных текущего тикера.
// Самый простой вариант: добавить новый optional проп `market` к CandlestickChart,
// дефолт 'stock'. Передавать его из InstrumentDetail/FuturesDetail/QuickChainChart.
const market: 'stock' | 'futures' = props.market ?? 'stock';
```

Расширить props-тип `CandlestickChartProps`: добавить `market?: 'stock' | 'futures'`.

- [ ] **Step 3: Debounced refetch видимого диапазона**

Рядом с `visibleRange` ref'ом (создать, если нет — на основе текущей логики `getInitialDateRange`):

```ts
const refetchTimer = useRef<number | null>(null);
const refetchVisible = useCallback(() => {
  if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
  refetchTimer.current = window.setTimeout(() => {
    // вызвать существующий path который тянет свечи в видимом диапазоне
    reloadCurrentRange();
  }, 2000);
}, [reloadCurrentRange]);
```

Где `reloadCurrentRange` — функция, которая запрашивает `instrumentsApi.candles` для текущего видимого `from/till/interval` и `setData`. Если такой функции нет — выделить её из существующего эффекта загрузки.

- [ ] **Step 4: Рендер кнопки в тулбаре**

В JSX, в блок с селектором интервалов, добавить условно:

```tsx
{isAdmin && (
  <AdminCandleSyncButton
    ticker={ticker}
    market={market}
    onProgress={refetchVisible}
    onSynced={refetchVisible}
  />
)}
```

- [ ] **Step 5: Прокинуть `market` из страниц**

- `InstrumentDetail.tsx` → `<CandlestickChart ticker={ticker} market="stock" .../>`
- `FuturesDetail.tsx` → `<CandlestickChart ticker={ticker} market="futures" .../>`
- `QuickChainChart.tsx` / `TradeForm.tsx` (определять по типу выбранного инструмента; если значение не известно явно, передать `'stock'` дефолтом — fallback в backend.)

- [ ] **Step 6: Проверить, что существующие тесты frontend не упали**

Run: `cd frontend && npm test -- --run`
Expected: PASS. Если падают моки `CandlestickChart` (см. `QuickTradeEntryPage.test.tsx`) — обновить сигнатуру мока, чтобы принимал `market` без ошибки.

- [ ] **Step 7: TypeScript build**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 0 ошибок.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/CandlestickChart.tsx frontend/src/pages/instruments/InstrumentDetail.tsx frontend/src/pages/instruments/FuturesDetail.tsx frontend/src/pages/trades/quick/QuickChainChart.tsx
git commit -m "feat(frontend): admin кнопка догрузки свечей в CandlestickChart"
```

(если правились другие страницы — добавить их в `git add`.)

---

## Phase 7: Ручная проверка и финал

### Task 17: Smoke под admin и обычным юзером

- [ ] **Step 1: Поднять стек**

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs --tail=50 web frontend celery
```

Ожидаемое: все 3 контейнера healthy, без traceback'ов.

- [ ] **Step 2: Логин admin → открыть `/instruments/<ticker>/`**

В браузере http://localhost:3000 → логин `admin / Qwer@12345` → открыть инструмент с малым покрытием (например только что добавленный или с пропуском).

Ожидаемое: справа от селектора интервалов виден элемент «Догрузить».

- [ ] **Step 3: Нажать кнопку → наблюдать прогресс**

Ожидаемое:
- POST `/api/instruments/<ticker>/sync-candles/` → 202.
- WS открыт (DevTools → Network → WS).
- В UI: спиннер + дробь `N/M`, увеличивается.
- График дорисовывается порциями (с задержкой ~2с от события прогресса).
- При завершении: иконка чекмарк ~3с, затем idle.

- [ ] **Step 4: Логин обычным юзером (создать через admin)**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py shell -c "
from django.contrib.auth import get_user_model
U = get_user_model()
U.objects.create_user('trader', password='Test@12345', is_staff=False)
"
```

В браузере: разлогиниться, войти `trader / Test@12345`, открыть тот же инструмент. Ожидаемое: кнопки нет.

- [ ] **Step 5: Тест ParallelClick (409)**

Под admin: нажать «Догрузить» дважды в течение секунды (или открыть две вкладки). Ожидаемое: первый клик 202, повторный 409 в Network. UI: вторая вкладка тоже подключается к WS и видит snapshot текущего прогресса.

- [ ] **Step 6: Тест 4404**

Открыть DevTools → попытаться вручную подключиться `new WebSocket('ws://localhost:3000/ws/candles-sync/ZZZZ/?token=' + localStorage.td_access)`. Ожидаемое: close code 4404.

- [ ] **Step 7: Bulk-задача проверка**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py shell -c "
from instruments.tasks import load_candles_for_instrument
load_candles_for_instrument('SBER', year=2026)
"
```

Ожидаемое: задача проходит через `sync_candles_for_instrument` (`find_missing_ranges`) и качает только пропуски. Лог `celery` показывает прогресс по диапазонам, а не по 12 месяцам подряд.

- [ ] **Step 8: Никаких регрессий — финальный full test pass**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test
cd frontend && npm test -- --run
cd frontend && npx tsc -b --noEmit
```

Expected: всё зелёное.

- [ ] **Step 9: Commit и push ветку**

Если есть финальные фиксы по smoke:
```bash
git add -A
git commit -m "fix(...): мелкие правки по результатам smoke"
```

Затем:
```bash
git push -u origin feature/admin-candle-sync
```

- [ ] **Step 10: Открыть PR**

(Опционально — по запросу пользователя.)

---

## Self-Review (для авторов плана)

**Spec coverage:**

| Раздел spec | Задача в плане |
|---|---|
| §3 архитектура | T7-T11 (backend), T14-T16 (frontend) |
| §4.1 candles_gaps | T2, T3 |
| §4.2 sync_candles_for_instrument + обёртки | T4, T5, T6 |
| §4.3 CandleSyncConsumer | T8 |
| §4.4 JWT middleware | T7 |
| §4.5 routing + asgi | T9 |
| §4.6 REST endpoints (POST, GET state) | T10, T11 |
| §4.7 WS-протокол | T8 (handlers), T13 (типы), T14 (хук) |
| §4.8 settings | T1 |
| §5.1 API client | T13 |
| §5.2 useCandleSyncSocket | T14 |
| §5.3 AdminCandleSyncButton | T15 |
| §5.4 интеграция CandlestickChart | T16 |
| §5.5 vite proxy | T12 |
| §6 обработка ошибок | покрытие тестами в T5, T8, T10 + smoke T17 |
| §7 миграции и совместимость | T6 (обёртки), `_MONTH_COMPLETE_THRESHOLD` удаление |
| §8 тесты | T2-T16 содержат тестовые шаги |
| §10 acceptance criteria | покрывается smoke в T17 |

**Известные мини-неоднозначности (намеренно оставлены для исполнителя):**
- В T16 структура `CandlestickChart` диктует точное место для refetch — исполнитель сам выбирает, выделять ли `reloadCurrentRange` в отдельную функцию или просто вызывать существующий effect (зависит от текущей структуры компонента).
- В T6 предположено, что `Futures.ticker` уже хранится upper-case; если нет — `.upper()` уже добавлен.
- В T7 cleanup `accounts/tests.py` → пакет — опционально, если файл уже пакет, шаг no-op.
