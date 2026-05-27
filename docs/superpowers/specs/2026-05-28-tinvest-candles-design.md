# T-Invest API: интеграция получения свечей

> Дата: 2026-05-28  
> Статус: утверждено  
> Scope: MVP — только свечи, справочник инструментов остаётся на MOEX ISS

## Контекст

Текущий подход — прямые HTTP-запросы к `iss.moex.com/iss/.../candles.json`. Проблемы:
- Задержка данных — часы вместо ожидаемых 15 минут
- Юридические риски при трансляции данных ISS третьим лицам

Решение: заменить источник свечей на T-Invest API (Tinkoff Investments). Каждый пользователь — клиент брокера, данные получает через свой токен. Сайт закрыт для регистрации — управление пользователями только через admin.

## Решения

| Вопрос | Решение |
|--------|---------|
| Хранение токена | БД (TraderProfile) + Fernet-шифрование |
| Источник данных | Полная замена ISS → T-Invest (без fallback) |
| Scope MVP | Только свечи, справочник инструментов — ISS |
| Частота обновления | 5 минут (было 30) |
| SDK | `tinkoff-investments` (официальный gRPC SDK) |
| Идентификатор инструмента | `instrument_uid` (UUID, рекомендация T-Invest) |

## 1. Хранение токена

### Модель

Поле `tinkoff_token` в `TraderProfile` (accounts/models.py). Шифрование: `cryptography.fernet.Fernet`, ключ из `DJANGO_SECRET_KEY`.

```python
# accounts/models.py
class TraderProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    _tinkoff_token = models.TextField("T-Invest API токен", blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

Property `tinkoff_token` расшифровывает при чтении, шифрует при записи. Fernet-ключ производится из `DJANGO_SECRET_KEY` через `PBKDF2HMAC`.

### API

- `PATCH /api/auth/me/` — принимает `tinkoff_token` (строка). Сериализатор:
  - write: шифрует и сохраняет
  - read: возвращает маскированный `"t.***"` или `null`
- Валидация при сохранении: пробный запрос `GetAccounts()` к T-Invest API. Невалидный токен → 400.

### Логика для Celery

Задача обновления свечей берёт токен admin-пользователя:
```python
profile = TraderProfile.objects.select_related("user").get(user__username="admin")
token = profile.tinkoff_token  # расшифровывается через property
```
Если токен пустой — задача скипается с `logger.warning`.

## 2. Модуль получения свечей

### Новый файл: `instruments/tinkoff_candles.py`

Функции:
- `fetch_tinkoff_candles(token, uid, from_dt, to_dt, interval)` → `list[dict]`
  - Использует `tinkoff.invest.services.MarketDataService.GetCandles()`
  - Возвращает формат: `{datetime, open, high, low, close, volume, value}`
  - Конвертирует `Quotation` (units + nano) → float
  - Дробит запросы при необходимости (ограничение T-Invest: ~1 день для 1-мин свечей)
- `resolve_instrument_uid(token, ticker, instrument_type)` → `str` (uid)
  - Через `InstrumentsService.FindInstrument()` или `ShareBy()`/`FutureBy()`
  - Кеш в Redis: `tinvest:uid:{ticker}` TTL=24h
  - Lazy-запись в поле `tinkoff_uid` модели Instrument/Futures

### Маппинг интервалов

```python
INTERVAL_MAP = {
    1:    CandleInterval.CANDLE_INTERVAL_1_MIN,
    5:    CandleInterval.CANDLE_INTERVAL_5_MIN,
    15:   CandleInterval.CANDLE_INTERVAL_15_MIN,
    60:   CandleInterval.CANDLE_INTERVAL_HOUR,
    1440: CandleInterval.CANDLE_INTERVAL_DAY,
}
```

### Переименование

`moex_candles.py` → `candles.py`. Из него удаляется `fetch_moex_candles()`, `MOEX_HTTP_HEADERS`, `_MOEX_CANDLES_URLS`. Функции хранения/чтения CSV остаются:
- `save_candles_to_csv()`
- `read_candles()`
- `resample_candles()`
- `candles_to_json()`
- `candle_dir()`, `candle_path()`
- `_CSV_COLUMNS`, `_MOSCOW_UTC_OFFSET`

## 3. Модели — новые поля

### Instrument

```python
tinkoff_uid = models.CharField("T-Invest UID", max_length=64, blank=True, default="")
```

### Futures

```python
tinkoff_uid = models.CharField("T-Invest UID", max_length=64, blank=True, default="")
```

Заполняются lazy при первом запросе свечей через `resolve_instrument_uid()`. Ручное заполнение через Django admin тоже возможно.

## 4. Celery задачи

### `update_today_candles` (периодическая, каждые 5 мин)

1. Получить токен admin-пользователя
2. Если токен пустой — skip + warning
3. Для каждого активного инструмента (Instrument is_active + Futures is_active):
   - `resolve_instrument_uid()` → получить/кешировать uid
   - `fetch_tinkoff_candles()` — свечи за сегодня
   - `save_candles_to_csv()` — сохранить в CSV
   - `cache.delete_pattern(f"candles:{ticker}:*")` — инвалидировать Redis
4. Rate limiting: пауза 0.2с между запросами
5. Error handling: ошибка одного инструмента не останавливает остальные

### `load_candles_for_instrument` (историческая загрузка)

Та же помесячная логика, но:
- Для 1-мин свечей T-Invest отдаёт максимум ~1 день за запрос → дробим на дни
- Пропуск дней с уже ≥1 CSV файлом (threshold адаптируем)
- `api_ticker` параметр → заменяется на `tinkoff_uid`

### `load_all_candles` (fan-out)

Без изменений в логике, меняется только внутренний вызов.

### Проверка связи

`_probe_moex()` → `_probe_tinkoff(token)`: лёгкий запрос `GetAccounts()` или `GetInfo()`.

## 5. Фронтенд

### Профиль (`/profile`)

Новая секция:
```
T-Invest API
Токен: t.***...*** [Обновить]
Статус: Подключено ✓
```

- Маскированный токен или «Не задан»
- Кнопка «Обновить токен» → инлайн-поле ввода
- При сохранении: `PATCH /api/auth/me/` с `tinkoff_token`
- Ошибка валидации → красный алерт

### Админка (`/admin/instruments`)

- Статус T-Invest: «Подключено» / «Токен admin не задан»
- Кнопки загрузки свечей работают без изменений

### Без изменений

- CandleDataView, графики, lightweight-charts — формат данных тот же
- Маршруты, навигация, остальные страницы

## 6. Зависимости

Новые пакеты в `requirements.txt`:
- `tinkoff-investments` — официальный SDK
- `cryptography` — Fernet-шифрование токена

## 7. Что удаляем

- `fetch_moex_candles()` из moex_candles.py
- `MOEX_HTTP_HEADERS`, `_MOEX_CANDLES_URLS` из moex_candles.py
- `_probe_moex()` из tasks.py
- Импорт `MOEX_HTTP_HEADERS` из tasks.py и management command

## 8. Что НЕ трогаем

- `load_instruments_from_moex` management command — справочник инструментов по-прежнему через ISS
- CSV-формат хранения свечей
- CandleDataView и API-эндпоинты для фронтенда
- Redis-кеширование свечей
- Docker-конфигурация (SDK ставится через requirements.txt)

## 9. Конфигурация

Новая переменная в `.env` (опционально, для fallback):
```
TINVEST_API_TOKEN=  # deprecated — предпочитаем БД
```

В `settings.py` — ничего нового. Fernet-ключ производится из существующего `DJANGO_SECRET_KEY`.

Интервал Celery Beat: `update_today_candles` → 300 секунд (было 1800).

## 10. Порядок реализации

1. Зависимости: `tinkoff-investments`, `cryptography`
2. Модель: поле `_tinkoff_token` в TraderProfile + шифрование
3. Модели: поле `tinkoff_uid` в Instrument и Futures + миграции
4. Модуль `tinkoff_candles.py`: fetch + resolve_uid
5. Рефакторинг `moex_candles.py` → `candles.py` (удаление MOEX-специфики)
6. Celery задачи: замена источника данных
7. API: расширение сериализатора профиля для токена
8. Фронтенд: ввод токена в профиле, статус в админке
9. Тестирование с реальным токеном
