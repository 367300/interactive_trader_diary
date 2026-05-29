# Admin Candle Sync — Design Spec

**Date:** 2026-05-29
**Branch:** feature/quick-trade-entry (или новая ветка feature/admin-candle-sync)
**Status:** Design approved, awaiting implementation plan

---

## 1. Цель и контекст

В приложении свечи хранятся как daily-CSV в `uploads/candles/{TICKER}/{YYYY}/{MM}/{DD}.csv`. Загрузка идёт двумя путями:

1. Periodic `update_today_candles` каждые 30 мин — для всех активных тикеров, только сегодняшний день.
2. Bulk `load_all_candles` (по admin-кнопке `/admin/candles/load/`) — fan-out на все инструменты, попытка за весь календарный год.

Болевые точки:

- Админу нужны **свежие данные конкретного тикера прямо сейчас**, без ожидания cron и без bulk-прогона по всем инструментам.
- Текущий `load_candles_for_instrument` пропускает месяц только по грубому костылю `month_csv_count >= 10` → может тянуть лишнее или пропустить реальный пробел.
- Нет визуального фидбэка о ходе долгой задачи.

Решение: единый gap-резолвер + унифицированная Celery-задача sync-логики + WebSocket push прогресса + admin-кнопка на компоненте графика.

## 2. User story

> Я админ. Открываю график инструмента (`InstrumentDetail`, `TradeForm` с графиком или `QuickChainChart`). Вижу кнопку «Догрузить свечи» в тулбаре графика. Жму. Появляется прогресс «3 из 47 диапазонов, +1240 свечей». График постепенно дорисовывает новые бары. По завершении — toast «Готово, +18 530 свечей за 4м 12с».

Обычный пользователь кнопку не видит.

## 3. Архитектура (общая схема)

```
[Admin клик]
   │ POST /api/instruments/{ticker}/sync-candles/
   ▼
[AdminCandleSyncView]
   │ Redis SET NX EX 6h candles:sync_lock:{ticker}
   │ → 409 если занят, 202 с task_id если свободен
   ▼
[Celery sync_candles_for_instrument]
   │ find_missing_ranges(ticker, start, end) → list[GapRange]
   │ для каждого range:
   │   fetch_tinkoff_candles → save_candles_to_csv
   │   cache.delete_pattern(candles:{ticker}:*)
   │   group_send("candles_sync_{ticker}", {type: sync.progress, ...})
   │   cache.set(candles:sync_state:{ticker}, event, 24h)
   │ финал: group_send sync.done, cache.delete state + lock
   ▼
[CandleSyncConsumer (Channels)]
   │ группа candles_sync_{ticker}
   ▼
[Frontend useCandleSyncSocket]
   │ debounced (2s) refetch видимого диапазона
   │ обновление прогресса в AdminCandleSyncButton
```

## 4. Backend

### 4.1 `instruments/candles_gaps.py` (новый)

```python
@dataclass(frozen=True)
class GapRange:
    from_date: date
    till_date: date  # включительно
    reason: Literal["missing_days", "tail"]

def find_missing_ranges(
    ticker: str,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[GapRange]: ...

def last_saved_candle_dt(ticker: str) -> datetime | None: ...
```

**Алгоритм `find_missing_ranges`:**

1. `start = start or date(settings.CANDLES_HISTORY_START_YEAR, 1, 1)`.
2. `end = end or date.today()`.
3. trading_days = будни в `[start, end]`. Праздники MOEX не учитываем (API вернёт пусто на праздник — терпимо).
4. `days_present = { d : candle_path(ticker, d).exists() and size > 0 }`.
5. `days_missing = trading_days - days_present`.
6. Сгруппировать подряд идущие в `GapRange(reason="missing_days")`.
7. Хвост: `last_dt = last_saved_candle_dt(ticker)`. Если сегодня — торговый день и `last_dt < сейчас`, добавить `GapRange(last_dt.date(), today, reason="tail")`. Дедуп с уже добавленными.
8. Sort + merge соседних диапазонов (день в день).

**`last_saved_candle_dt`:**
- Идти от текущего месяца назад, искать последний существующий day CSV.
- Читать `max(datetime)` из последнего CSV (только колонка datetime).
- Кеш `candles:last_saved:{ticker}` TTL 60 сек.

### 4.2 `instruments/tasks.py`

Новая задача:

```python
@shared_task(bind=True, time_limit=7200, soft_time_limit=7000)
def sync_candles_for_instrument(
    self, ticker: str, *,
    market: str = "stock",
    api_ticker: str | None = None,
    start: str | None = None,   # ISO
    end: str | None = None,
    triggered_by: int | None = None,
):
```

Поведение:
- Достать admin token → если нет, `sync.error` `no_token`, освободить lock, return.
- Разрешить UID → если нет, `sync.error` `uid_not_found`.
- `ranges = find_missing_ranges(ticker, start, end)`.
- Цикл по ranges: fetch → save → invalidate cache → `group_send sync.progress` → `cache.set` state → sleep 0.2.
- Catch `SoftTimeLimitExceeded` → `sync.error` `timeout`.
- В финале: `group_send sync.done`, `cache.delete` state + lock.

Старые задачи становятся обёртками:

```python
@shared_task(bind=True, time_limit=7200, soft_time_limit=7000)
def load_candles_for_instrument(self, ticker, year=None, market="stock", api_ticker=None):
    year = year or date.today().year
    start = date(year, 1, 1)
    end = min(date(year, 12, 31), date.today())
    return sync_candles_for_instrument(
        ticker, market=market, api_ticker=api_ticker,
        start=start.isoformat(), end=end.isoformat(),
    )

@shared_task(bind=True)
def update_today_candles(self):
    # fan-out sync_candles_for_instrument.apply_async(start=today, end=today)
    ...
```

Удалить `_MONTH_COMPLETE_THRESHOLD`.

### 4.3 `instruments/consumers.py` (новый)

```python
class CandleSyncConsumer(JsonWebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        if not user.is_authenticated or not user.is_staff:
            self.close(code=4403); return
        self.ticker = self.scope["url_route"]["kwargs"]["ticker"].upper()
        if not _ticker_exists(self.ticker):
            self.close(code=4404); return
        self.group = f"candles_sync_{self.ticker}"
        async_to_sync(self.channel_layer.group_add)(self.group, self.channel_name)
        self.accept()
        state = cache.get(f"candles:sync_state:{self.ticker}")
        if state:
            self.send_json({"type": "sync.snapshot", **state})

    def disconnect(self, code):
        if hasattr(self, "group"):
            async_to_sync(self.channel_layer.group_discard)(self.group, self.channel_name)

    def sync_progress(self, event): self.send_json(event)
    def sync_done(self, event):     self.send_json(event)
    def sync_error(self, event):    self.send_json(event)
```

### 4.4 JWT WS middleware (`accounts/channels_auth.py` новый)

- Читает `?token=<jwt>` из query string.
- Валидирует через `simplejwt` AccessToken → `scope["user"] = User`.
- Невалидно → `AnonymousUser`.

### 4.5 `django_base/routing.py` + `asgi.py`

```python
# routing.py
websocket_urlpatterns = [
    re_path(r"ws/candles-sync/(?P<ticker>[A-Z0-9._-]+)/$", CandleSyncConsumer.as_asgi()),
]

# asgi.py
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns))
    ),
})
```

### 4.6 REST endpoints

| Method | Path | View | Permission |
|---|---|---|---|
| POST | `/api/instruments/{ticker}/sync-candles/` | `AdminCandleSyncView` | IsAdminUser |
| GET | `/api/instruments/{ticker}/sync-candles/state/` | `AdminCandleSyncStateView` | IsAdminUser |

**POST логика:**
1. Резолв `ticker` → market+api_ticker. Иначе 404.
2. Redis `SET candles:sync_lock:{ticker} value=pending NX EX 21600`.
   - Если не взялся: 409 + текущий `task_id` (из `candles:sync_state:{ticker}.task_id`).
3. `task = sync_candles_for_instrument.apply_async(...)`.
4. `SET candles:sync_lock:{ticker} value=<task_id> EX 21600`.
5. 202 `{ task_id, ticker }`.

**GET логика:** возврат `cache.get(candles:sync_state:{ticker})` или `null`.

Body POST (опционально, V1):
- `start` (ISO date) — для тонкой настройки. Если не задан → дефолт gap-резолвера.
- `end` (ISO date) — то же.

### 4.7 WS-протокол

| `type` | Поля | Когда |
|---|---|---|
| `sync.snapshot` | `task_id, done_ranges, total_ranges, range_from, range_till, cumulative_candles` | На connect, если активна |
| `sync.progress` | то же + `range_candles` | После каждого диапазона |
| `sync.done` | `task_id, total_ranges, cumulative_candles, duration_s, errors` | Финал |
| `sync.error` | `task_id, message` | Фатальная ошибка |

Close-коды:
- `4401` — невалидный/протухший JWT (клиент рефрешит).
- `4403` — не is_staff.
- `4404` — тикер не найден.

### 4.8 Настройки (`settings.py`)

```python
CANDLES_HISTORY_START_YEAR = config("CANDLES_HISTORY_START_YEAR", default=date.today().year, cast=int)
CANDLES_SYNC_LOCK_TTL = 21600
```

## 5. Frontend

### 5.1 API client (`api/endpoints.ts`)

```ts
export const adminCandleSync = {
  start: (ticker, body?) => api.post<{task_id, ticker}>(`/instruments/${ticker}/sync-candles/`, body ?? {}),
  state: (ticker) => api.get<SyncState | null>(`/instruments/${ticker}/sync-candles/state/`),
};
```

### 5.2 Хук `lib/useCandleSyncSocket.ts`

```ts
useCandleSyncSocket(ticker, {
  enabled: boolean,           // false для не-admin
  onProgress?: (e) => void,
  onDone?:     (e) => void,
  onError?:    (e) => void,
}): { state: 'idle' | 'running' | 'done' | 'error', last: SyncEvent | null }
```

- Открывает `${wsBase}/ws/candles-sync/${ticker}/?token=${access}`.
- На mount читает `adminCandleSync.state()` для bootstrap до первого WS-события.
- Reconnect backoff `1s → 2s → 5s → 10s`, только если последнее состояние было `running`.
- На close 4401 — `refreshAccessToken()` + переоткрыть.
- На close 4403/4404 — не реконнектить, выставить `error`.

### 5.3 Кнопка `components/AdminCandleSyncButton.tsx`

Пропы: `ticker`, `market`, `onProgress?`, `onSynced?`.

Состояния:
- **idle** — иконка `RefreshCw`, tooltip «Догрузить свечи».
- **running** — спиннер + `done_ranges/total_ranges`, popover с деталями (диапазон, cumulative).
- **done** — зелёная галочка ~3 сек, затем idle.
- **error** — красная иконка, popover с `message`.

Клик при idle → POST. 409 → popover с текущим прогрессом (хук уже подписан). Клик при running → disabled.

### 5.4 Интеграция в `CandlestickChart.tsx`

- `const { user } = useAuth(); const isAdmin = !!user?.is_staff;`
- Кнопка рендерится только при `isAdmin` — в тулбаре рядом с селектором интервалов.
- Debounced (2s) refetch видимого диапазона на каждый `progress`.
- Restore viewport: сохранять `timeScale().getVisibleLogicalRange()` перед `setData`, восстанавливать после.
- Drawings и markers переживают refetch (уже есть в текущей логике).

### 5.5 Vite dev-прокси

```ts
// vite.config.ts
server: {
  proxy: {
    '/ws': { target: 'ws://web:8000', ws: true },
    // существующие /api, /admin, /static, /media
  }
}
```

Prod (Traefik): WS идёт через тот же origin, upgrade-хедер пропускается.

## 6. Обработка ошибок

| Слой | Сценарий | Поведение |
|---|---|---|
| View POST | не is_staff | 403 |
| View POST | тикер не найден | 404 |
| View POST | lock занят | 409 + текущий task_id |
| View POST | Redis недоступен | 503 |
| Celery | нет admin токена | `sync.error` `no_token`, lock освобождён |
| Celery | UID не разрешён | `sync.error` `uid_not_found` |
| Celery | T-Invest 429 | внутренний retry + sleep 0.2 |
| Celery | exception в range | log + errors++, продолжать |
| Celery | SIGKILL | lock истечёт по TTL 6ч |
| Celery | soft timeout | `sync.error` `timeout`, lock освобождён |
| WS consumer | unknown ticker | close 4404 |
| WS consumer | не is_staff | close 4403 |
| WS consumer | invalid JWT | close 4401 |
| Frontend | WS upgrade провален | fallback polling `state/` каждые 5с |
| Frontend | POST 503 | toast, кнопка → idle |

## 7. Миграции и совместимость

- `load_candles_for_instrument` — сигнатура сохраняется, тело → обёртка.
- `load_all_candles` — fan-out тот же, через обёртку получает gap-резолвер.
- `update_today_candles` — fan-out `sync_candles_for_instrument(start=today, end=today)`.
- `_MONTH_COMPLETE_THRESHOLD` — удалить.
- Celery beat schedule — без изменений.
- `/admin/candles/load/` — без изменений.

## 8. Тесты

| Уровень | Покрытие |
|---|---|
| Unit (pytest + tmp_path) | `find_missing_ranges` 5 сценариев, `last_saved_candle_dt`, merge gap'ов |
| Unit | `sync_candles_for_instrument` happy/no_token/uid_not_found/exception в range/timeout |
| Unit | обёртки `load_candles_for_instrument`, `update_today_candles` |
| API | POST 202/403/404/409, GET state |
| WS | connect/disconnect, snapshot, JWT auth, close 4401/4403/4404 |
| Frontend unit (vitest) | `useCandleSyncSocket` backoff/refresh/snapshot race |
| Frontend unit | `AdminCandleSyncButton` 4 состояния, 409 |
| Frontend integration | `CandlestickChart` рендерит кнопку только при is_staff |

Ручная проверка после реализации:
- Admin: открыть `InstrumentDetail` свежего тикера → жмём → видим прогресс по range'ам → график дорисовывается → toast.
- Второй tab того же тикера → snapshot.
- Обычный юзер: кнопки нет.
- `QuickChainChart`, `TradeForm` график — кнопка тоже видна.
- Рестарт `web` во время задачи → WS реконнектится.

## 9. Out of scope (V2)

- Кнопка отмены задачи.
- Глобальный индикатор задач в шапке.
- UI-выбор глубины истории (backend параметры готовы).
- Negative-cache праздничных дней MOEX.
- E2E (Playwright) сценарий.
- Уведомления (push / email) о завершении.

## 10. Acceptance criteria

- [ ] Под admin на любой странице с графиком виден элемент «Догрузить свечи».
- [ ] Под обычным пользователем элемента нет.
- [ ] Клик → задача стартует за <1с, прогресс приходит инкрементально.
- [ ] График дорисовывается без сбоя viewport и без потери drawings.
- [ ] Второй параллельный клик → 409, не дубль.
- [ ] После завершения toast с количеством свечей и временем.
- [ ] `load_all_candles` через тот же gap-резолвер качает только пропуски, не весь год.
- [ ] Все новые модули покрыты тестами (см. секцию 8).
