# T-Invest Candles Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MOEX ISS API with T-Invest gRPC SDK for fetching OHLCV candles; store user's API token encrypted in DB with UI in profile page.

**Architecture:** New module `tinkoff_candles.py` wraps the official `tinkoff-investments` SDK. Existing CSV storage layer (`candles.py`, renamed from `moex_candles.py`) stays unchanged. Celery tasks switch from ISS to T-Invest, running every 5 min instead of 30. Token encrypted with Fernet in TraderProfile.

**Tech Stack:** `tinkoff-investments` (gRPC SDK), `cryptography` (Fernet), Django 5.2, Celery 5.5, React 18

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `django_base/instruments/tinkoff_candles.py` | Fetch candles + resolve instrument UID via T-Invest SDK |
| Create | `django_base/accounts/encryption.py` | Fernet encrypt/decrypt helpers derived from SECRET_KEY |
| Rename | `django_base/instruments/moex_candles.py` → `django_base/instruments/candles.py` | CSV storage, reading, resampling (source-agnostic) |
| Modify | `django_base/accounts/models.py` | Add `_tinkoff_token` encrypted field to TraderProfile |
| Modify | `django_base/accounts/serializers.py` | Token write (encrypt) + masked read in TraderProfileSerializer |
| Modify | `django_base/accounts/views.py` | Token validation on save |
| Modify | `django_base/instruments/models.py` | Add `tinkoff_uid` to Instrument and Futures |
| Modify | `django_base/instruments/tasks.py` | Switch from ISS to T-Invest, 5-min interval |
| Modify | `django_base/instruments/views.py:145-148` | Update import path `moex_candles` → `candles` |
| Modify | `django_base/django_base/settings.py:217` | Celery Beat 1800 → 300 |
| Modify | `requirements.txt` | Add `tinkoff-investments`, `cryptography` |
| Modify | `frontend/src/api/types.ts` | Add `tinkoff_token_masked` to Profile |
| Modify | `frontend/src/api/endpoints.ts` | Add token update endpoint |
| Modify | `frontend/src/pages/Profile.tsx` | Token input section |
| Modify | `frontend/src/pages/admin/InstrumentsLoad.tsx` | T-Invest connection status |

---

### Task 1: Dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add packages**

Add to end of `requirements.txt`:

```
tinkoff-investments
cryptography
```

- [ ] **Step 2: Install in container**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web pip install tinkoff-investments cryptography
```

Expected: packages install without errors.

- [ ] **Step 3: Verify import**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "from tinkoff.invest import Client; print('OK')"
docker compose -f docker-compose.dev.yml exec web python -c "from cryptography.fernet import Fernet; print('OK')"
```

Expected: `OK` twice.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "chore(deps): добавить tinkoff-investments и cryptography"
```

---

### Task 2: Encryption helpers

**Files:**
- Create: `django_base/accounts/encryption.py`

- [ ] **Step 1: Create encryption module**

```python
"""Fernet-шифрование для хранения чувствительных данных в БД."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _derive_key() -> bytes:
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return Fernet(_derive_key()).encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return Fernet(_derive_key()).decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return ""
```

- [ ] **Step 2: Verify in shell**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from accounts.encryption import encrypt, decrypt
enc = encrypt('test-token-123')
print('encrypted:', enc[:20] + '...')
print('decrypted:', decrypt(enc))
print('empty:', decrypt(''))
"
```

Expected:
```
encrypted: gAAAAAB...
decrypted: test-token-123
empty:
```

- [ ] **Step 3: Commit**

```bash
git add django_base/accounts/encryption.py
git commit -m "feat(accounts): модуль Fernet-шифрования для хранения токенов"
```

---

### Task 3: TraderProfile — encrypted token field

**Files:**
- Modify: `django_base/accounts/models.py`

- [ ] **Step 1: Add field and property**

Replace full file content:

```python
from django.db import models
from django.contrib.auth.models import User


class TraderProfile(models.Model):
    """Профиль трейдера с дополнительными данными"""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='trader_profile',
        verbose_name='Пользователь'
    )

    _tinkoff_token = models.TextField(
        "T-Invest API токен (зашифрованный)",
        blank=True,
        default="",
        db_column="tinkoff_token",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )

    class Meta:
        verbose_name = 'Профиль трейдера'
        verbose_name_plural = 'Профили трейдеров'
        db_table = 'accounts_trader_profile'

    def __str__(self):
        return f'Профиль {self.user.username}'

    @property
    def tinkoff_token(self) -> str:
        from accounts.encryption import decrypt
        return decrypt(self._tinkoff_token)

    @tinkoff_token.setter
    def tinkoff_token(self, value: str):
        from accounts.encryption import encrypt
        self._tinkoff_token = encrypt(value) if value else ""

    @property
    def tinkoff_token_masked(self) -> str | None:
        token = self.tinkoff_token
        if not token:
            return None
        return token[:4] + "***" + token[-4:] if len(token) > 8 else "***"

    @property
    def has_tinkoff_token(self) -> bool:
        return bool(self._tinkoff_token)
```

- [ ] **Step 2: Create migration**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python manage.py makemigrations accounts --name add_tinkoff_token --skip-checks
```

Expected: migration created.

- [ ] **Step 3: Apply migration**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python manage.py migrate accounts --skip-checks
```

Expected: `OK`

- [ ] **Step 4: Verify in shell**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from accounts.models import TraderProfile
p = TraderProfile.objects.first()
p.tinkoff_token = 't.test-token-abc123'
p.save()
p.refresh_from_db()
print('masked:', p.tinkoff_token_masked)
print('decrypted:', p.tinkoff_token)
print('has:', p.has_tinkoff_token)
# cleanup
p._tinkoff_token = ''
p.save()
"
```

Expected:
```
masked: t.te***c123
decrypted: t.test-token-abc123
has: True
```

- [ ] **Step 5: Commit**

```bash
git add django_base/accounts/models.py django_base/accounts/migrations/
git commit -m "feat(accounts): зашифрованное хранение T-Invest API токена в профиле"
```

---

### Task 4: Instrument/Futures — tinkoff_uid field

**Files:**
- Modify: `django_base/instruments/models.py`

- [ ] **Step 1: Add `tinkoff_uid` to Instrument**

In `django_base/instruments/models.py`, add after `is_active` field (around line 170):

```python
    tinkoff_uid = models.CharField(
        "T-Invest UID",
        max_length=64,
        blank=True,
        default="",
    )
```

- [ ] **Step 2: Add `tinkoff_uid` to Futures**

Same field, add after `is_active` field in Futures model (around line 315):

```python
    tinkoff_uid = models.CharField(
        "T-Invest UID",
        max_length=64,
        blank=True,
        default="",
    )
```

- [ ] **Step 3: Create and apply migration**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python manage.py makemigrations instruments --name add_tinkoff_uid --skip-checks
docker compose -f docker-compose.dev.yml exec web python manage.py migrate instruments --skip-checks
```

Expected: migration created and applied.

- [ ] **Step 4: Commit**

```bash
git add django_base/instruments/models.py django_base/instruments/migrations/
git commit -m "feat(instruments): поле tinkoff_uid для Instrument и Futures"
```

---

### Task 5: Rename moex_candles.py → candles.py + strip MOEX-specific code

**Files:**
- Rename: `django_base/instruments/moex_candles.py` → `django_base/instruments/candles.py`
- Modify: `django_base/instruments/views.py:145-148`

- [ ] **Step 1: Rename file via git**

```bash
git mv django_base/instruments/moex_candles.py django_base/instruments/candles.py
```

- [ ] **Step 2: Remove MOEX-specific code from candles.py**

Remove from `candles.py`:
- `_MOEX_CANDLES_URLS` dict (lines 30-39)
- `MOEX_HTTP_HEADERS` dict (lines 43-51)
- `_MOEX_PAGE_SIZE` constant (line 41)
- `fetch_moex_candles()` function (lines ~117-205)
- `_candles_list_to_df()` helper (lines ~265-290) — this was MOEX response normalization

Keep all CSV/storage functions:
- `_CSV_COLUMNS`, `_MOSCOW_UTC_OFFSET`, `_RESAMPLE_FREQS`
- `_candles_root()`, `candle_dir()`, `candle_path()`, `month_csv_count()`
- `save_candles_to_csv()`
- `read_candles()`
- `resample_candles()`
- `candles_to_json()`

Update module docstring:

```python
"""
Утилиты для хранения и обработки свечей (source-agnostic).

Функции:
- save_candles_to_csv — сохранение свечей в CSV (по дням)
- read_candles        — чтение свечей из CSV за диапазон дат
- resample_candles    — пересэмплирование до 5m/15m/30m/1h/4h/1D
- candles_to_json     — конвертация DataFrame → JSON для lightweight-charts
"""
```

Remove unused imports: `requests`, `time` (if only used by fetch_moex_candles).

- [ ] **Step 3: Update import in views.py**

In `django_base/instruments/views.py`, line 145-148, change:

```python
        from instruments.moex_candles import (
```

to:

```python
        from instruments.candles import (
```

- [ ] **Step 4: Verify views still work**

Run:
```bash
curl -s "http://localhost:8000/api/instruments/SBER/candles/?from=2026-05-27&till=2026-05-27" | python3 -m json.tool | head -5
```

Expected: JSON response with candles (or empty `count: 0`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(instruments): переименовать moex_candles → candles, удалить MOEX-специфику"
```

---

### Task 6: T-Invest candles module

**Files:**
- Create: `django_base/instruments/tinkoff_candles.py`

- [ ] **Step 1: Create module**

```python
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
```

- [ ] **Step 2: Verify import**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from instruments.tinkoff_candles import INTERVAL_MAP, validate_token, _q
from tinkoff.invest.schemas import Quotation
print('q:', _q(Quotation(units=322, nano=500000000)))
print('intervals:', len(INTERVAL_MAP))
"
```

Expected:
```
q: 322.5
intervals: 7
```

- [ ] **Step 3: Commit**

```bash
git add django_base/instruments/tinkoff_candles.py
git commit -m "feat(instruments): модуль получения свечей через T-Invest API"
```

---

### Task 7: Celery tasks — switch to T-Invest

**Files:**
- Modify: `django_base/instruments/tasks.py`
- Modify: `django_base/django_base/settings.py:217`

- [ ] **Step 1: Rewrite tasks.py**

Replace the full content of `django_base/instruments/tasks.py`:

```python
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
```

- [ ] **Step 2: Update Celery Beat interval**

In `django_base/django_base/settings.py`, change:

```python
        "schedule": 1800.0,  # every 30 minutes
```

to:

```python
        "schedule": 300.0,  # every 5 minutes
```

- [ ] **Step 3: Verify tasks import**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from instruments.tasks import update_today_candles, load_candles_for_instrument, load_all_candles
print('tasks OK')
"
```

Expected: `tasks OK`

- [ ] **Step 4: Commit**

```bash
git add django_base/instruments/tasks.py django_base/django_base/settings.py
git commit -m "feat(instruments): Celery-задачи загрузки свечей через T-Invest, интервал 5 мин"
```

---

### Task 8: Serializer + API — token save/read with validation

**Files:**
- Modify: `django_base/accounts/serializers.py`
- Modify: `django_base/accounts/views.py`

- [ ] **Step 1: Update TraderProfileSerializer**

In `django_base/accounts/serializers.py`, replace `TraderProfileSerializer`:

```python
class TraderProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    tinkoff_token = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    tinkoff_token_masked = serializers.CharField(read_only=True)
    has_tinkoff_token = serializers.BooleanField(read_only=True)

    class Meta:
        model = TraderProfile
        fields = (
            'user', 'created_at', 'updated_at',
            'tinkoff_token', 'tinkoff_token_masked', 'has_tinkoff_token',
        )
        read_only_fields = ('created_at', 'updated_at')

    def update(self, instance, validated_data):
        token = validated_data.pop('tinkoff_token', None)
        if token is not None:
            instance.tinkoff_token = token
        return super().update(instance, validated_data)
```

- [ ] **Step 2: Add token validation in MeView**

In `django_base/accounts/views.py`, update the `patch` method of `MeView`:

```python
    def patch(self, request):
        user = request.user
        profile, _ = TraderProfile.objects.get_or_create(user=user)

        tinkoff_token = request.data.get('tinkoff_token')
        if tinkoff_token:
            from instruments.tinkoff_candles import validate_token
            if not validate_token(tinkoff_token):
                return Response(
                    {"tinkoff_token": ["Невалидный токен T-Invest API."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        profile_serializer = TraderProfileSerializer(
            profile, data=request.data, partial=True
        )
        profile_serializer.is_valid(raise_exception=True)
        profile_serializer.save()

        user_data = request.data.copy()
        user_data.pop('tinkoff_token', None)
        if user_data:
            user_serializer = UserSerializer(user, data=user_data, partial=True)
            user_serializer.is_valid(raise_exception=True)
            user_serializer.save()

        return Response(TraderProfileSerializer(profile).data)
```

Also update `get` method to return profile via `TraderProfileSerializer` consistently — the `get` already does this via `TraderProfileSerializer(profile).data`.

- [ ] **Step 3: Add import**

Ensure `TraderProfile` and `TraderProfileSerializer` are imported in `views.py`. Already present:

```python
from .models import TraderProfile
from .serializers import (
    ...
    TraderProfileSerializer,
    ...
)
```

- [ ] **Step 4: Commit**

```bash
git add django_base/accounts/serializers.py django_base/accounts/views.py
git commit -m "feat(accounts): API сохранения/чтения T-Invest токена с валидацией"
```

---

### Task 9: Frontend — Profile token input

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/Profile.tsx`

- [ ] **Step 1: Update types**

In `frontend/src/api/types.ts`, update `Profile` interface:

```typescript
export interface Profile {
  user: User;
  created_at: string;
  updated_at: string;
  tinkoff_token_masked: string | null;
  has_tinkoff_token: boolean;
  stats: ProfileStats;
}
```

- [ ] **Step 2: Update Profile page**

Replace `frontend/src/pages/Profile.tsx`:

```tsx
import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../api/endpoints';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  if (!profile) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка профиля…</div>;
  const { user, stats } = profile;

  return (
    <section>
      <h1>Профиль</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card>
          <CardHeader>
            <CardTitle>Учётная запись</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><span className="text-muted-foreground text-sm">Имя пользователя</span><div>{user.username}</div></div>
            <div><span className="text-muted-foreground text-sm">Email</span><div>{user.email || '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Имя/Фамилия</span><div>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Роль</span><div>{user.is_staff ? 'Администратор' : 'Трейдер'}</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><div className="stat-label">Всего сделок</div><div className="text-2xl font-bold mt-1">{stats.total_trades}</div></div>
              <div><div className="stat-label">Закрытых</div><div className="text-2xl font-bold mt-1 text-green">{stats.closed_trades}</div></div>
              <div><div className="stat-label">Открытых</div><div className="text-2xl font-bold mt-1 text-soft-foreground">{stats.open_trades}</div></div>
              <div><div className="stat-label">Активных стратегий</div><div className="text-2xl font-bold mt-1">{stats.active_strategies}</div></div>
            </div>
          </CardContent>
        </Card>
        <TinkoffTokenCard
          masked={profile.tinkoff_token_masked}
          hasToken={profile.has_tinkoff_token}
          onSaved={refreshProfile}
        />
      </div>
    </section>
  );
}

function TinkoffTokenCard({
  masked,
  hasToken,
  onSaved,
}: {
  masked: string | null;
  hasToken: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await authApi.updateMe({ tinkoff_token: token } as any);
      setSuccess('Токен сохранён');
      setToken('');
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      const msg =
        err?.data?.tinkoff_token?.[0] || err?.message || 'Ошибка сохранения';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.updateMe({ tinkoff_token: '' } as any);
      setSuccess('Токен удалён');
      await onSaved();
    } catch {
      setError('Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>T-Invest API</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-muted-foreground text-sm">Токен</span>
          <div className="font-mono text-sm mt-0.5">
            {hasToken ? masked : <span className="text-muted-foreground">Не задан</span>}
          </div>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {editing ? (
          <form onSubmit={onSubmit} className="space-y-2">
            <Label>Новый токен</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="t.xxx..."
              required
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={busy}>
                {busy ? 'Проверяем…' : 'Сохранить'}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => { setEditing(true); setError(null); setSuccess(null); }}>
              {hasToken ? 'Обновить токен' : 'Добавить токен'}
            </Button>
            {hasToken && (
              <Button variant="destructive" size="sm" disabled={busy} onClick={onClear}>
                Удалить
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Токен используется для получения котировок. Создать токен можно в настройках
          приложения Т-Инвестиции (readonly-доступ).
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: TypeScript check**

Run:
```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/Profile.tsx
git commit -m "feat(frontend): ввод и отображение T-Invest API токена в профиле"
```

---

### Task 10: Admin page — T-Invest status

**Files:**
- Modify: `frontend/src/pages/admin/InstrumentsLoad.tsx`

- [ ] **Step 1: Add status indicator**

At the top of `InstrumentsLoad` component, add T-Invest connection status. Import `useAuth`:

```tsx
import { useAuth } from '@/auth/AuthContext';
```

Inside `InstrumentsLoad()`, before `return`:

```tsx
const { profile } = useAuth();
const tinvestConnected = profile?.has_tinkoff_token ?? false;
```

Add a status line right after `<h1>` and `<p>`:

```tsx
<div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-4 ${tinvestConnected ? 'bg-green/10 text-green' : 'bg-yellow/10 text-yellow'}`}>
  <span className={`w-1.5 h-1.5 rounded-full ${tinvestConnected ? 'bg-green' : 'bg-yellow'}`} />
  {tinvestConnected ? 'T-Invest подключён' : 'T-Invest: токен admin не задан'}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/InstrumentsLoad.tsx
git commit -m "feat(frontend): статус подключения T-Invest в админ-панели"
```

---

### Task 11: Integration test with real token

This task requires a real T-Invest API token. Execute manually.

- [ ] **Step 1: Set token via profile UI**

1. Login as admin at http://localhost:3000
2. Go to `/profile`
3. Click «Добавить токен»
4. Paste real T-Invest token
5. Verify: green «Токен сохранён», masked token appears

- [ ] **Step 2: Test candle fetch manually**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from accounts.models import TraderProfile
from instruments.tinkoff_candles import resolve_instrument_uid, fetch_tinkoff_candles
from datetime import date

profile = TraderProfile.objects.get(user__username='admin')
token = profile.tinkoff_token
print('Token present:', bool(token))

uid = resolve_instrument_uid(token, 'SBER', 'STOCK')
print('SBER UID:', uid)

candles = fetch_tinkoff_candles(token, uid, date.today(), date.today())
print('Candles today:', len(candles))
if candles:
    print('Last:', candles[-1])
"
```

Expected: UID resolved, candles fetched.

- [ ] **Step 3: Test Celery task**

Run:
```bash
docker compose -f docker-compose.dev.yml exec web python -c "
import django; django.setup()
from instruments.tasks import update_today_candles
result = update_today_candles()
print(result)
"
```

Expected: `{"date": "...", "updated": N, "total": M, "errors": 0}`

- [ ] **Step 4: Verify chart in browser**

1. Go to any instrument page with a chart
2. Confirm candles display correctly
3. Check dev console for errors

- [ ] **Step 5: Rebuild containers**

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Verify all services start without errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: финализация интеграции T-Invest API"
```
